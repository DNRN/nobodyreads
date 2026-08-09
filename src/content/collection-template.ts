/**
 * The collection template language.
 *
 * A collection is two halves: a SQL query that decides *which* rows, and a
 * template that decides *how* they look. The query half has been validated
 * against an allowlist since it was written (`custom-view-sql.ts`). This is the
 * other half.
 *
 * It replaces what used to be a JavaScript function body executed with
 * `new Function(...)` on the server — arbitrary code with `process.env` in
 * scope, which is why custom collections had to be disabled by default. Authors
 * still write the markup; they simply cannot run code, so there is nothing to
 * sandbox and nothing to gate.
 *
 * The language is deliberately small:
 *
 *   literal HTML                      passes through untouched
 *   {{field}} / {{a.b}}               a value, HTML-escaped
 *   {{#each rows}} … {{/each}}        repeat for each row
 *   {{#if field}} … {{else}} … {{/if}} branch on a value being present
 *   {{helper arg}}                    one of the fixed helpers below
 *
 * Everything is escaped: there is no raw-output form. The template is where
 * markup belongs, so a row value never needs to carry HTML.
 *
 * A missing field renders empty rather than throwing. Authors are writing
 * against their own query results and a typo should show a gap, not replace the
 * page with an error.
 */

export interface TemplateHelperContext {
  /** URL prefix for this tenant, e.g. "" or "/alice". */
  urlPrefix: string;
}

type Helper = (arg: string, ctx: TemplateHelperContext) => string;

/**
 * The fixed helper set.
 *
 * Deliberately tiny and additive: a template can only reach what is named here,
 * so widening the language is a decision taken in this file rather than
 * something an author can do from the outside.
 */
const HELPERS: Record<string, Helper> = {
  /** A site-relative URL: `{{url slug}}` → `/alice/about`. */
  url: (value, ctx) => `${ctx.urlPrefix}/${String(value).replace(/^\/+/, "")}`,
  /** A post URL: `{{postUrl slug}}` → `/alice/posts/reeling-in`. */
  postUrl: (value, ctx) => `${ctx.urlPrefix}/posts/${String(value).replace(/^\/+/, "")}`,
  /** A human date: `{{date date}}` → `2 Aug 2026`. Invalid input passes through. */
  date: (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  },
};

export const TEMPLATE_HELPERS = Object.keys(HELPERS);

// --- AST -------------------------------------------------------------------

type Expr = { kind: "path"; path: string[] } | { kind: "helper"; name: string; path: string[] };

type Node =
  | { kind: "text"; value: string }
  | { kind: "value"; expr: Expr }
  | { kind: "each"; expr: Expr; body: Node[] }
  | { kind: "if"; expr: Expr; body: Node[]; alt: Node[] };

export interface ParsedTemplate {
  nodes: Node[];
}

export type ParseResult =
  | { ok: true; template: ParsedTemplate }
  | { ok: false; error: string };

const TAG = /\{\{([^}]*)\}\}/g;

function parseExpr(source: string): Expr | string {
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "an empty {{ }}";

  if (parts.length === 1) {
    return { kind: "path", path: parts[0]!.split(".") };
  }

  const [name, ...rest] = parts;
  if (!Object.hasOwn(HELPERS, name!)) {
    return `unknown helper "${name}" (available: ${TEMPLATE_HELPERS.join(", ")})`;
  }
  if (rest.length !== 1) {
    return `helper "${name}" takes exactly one value`;
  }
  return { kind: "helper", name: name!, path: rest[0]!.split(".") };
}

/**
 * Parse a template into nodes.
 *
 * Errors are returned rather than thrown: the editor shows them next to the
 * template, and a stored template that no longer parses must degrade to a
 * message rather than take a page down.
 */
export function parseCollectionTemplate(source: string): ParseResult {
  const nodes: Node[] = [];
  // Each open block pushes a frame; the innermost is what new nodes go into.
  const stack: { kind: "each" | "if"; node: Node; intoAlt: boolean }[] = [];

  function push(node: Node) {
    const frame = stack[stack.length - 1];
    if (!frame) return void nodes.push(node);
    if (frame.kind === "if" && frame.intoAlt) (frame.node as { alt: Node[] }).alt.push(node);
    else (frame.node as { body: Node[] }).body.push(node);
  }

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TAG.lastIndex = 0;

  while ((match = TAG.exec(source)) !== null) {
    if (match.index > lastIndex) {
      push({ kind: "text", value: source.slice(lastIndex, match.index) });
    }
    lastIndex = match.index + match[0].length;

    const body = match[1]!.trim();

    if (body.startsWith("#each") || body.startsWith("#if")) {
      const isEach = body.startsWith("#each");
      const expr = parseExpr(body.slice(isEach ? 5 : 3));
      if (typeof expr === "string") return { ok: false, error: expr };
      const node: Node = isEach
        ? { kind: "each", expr, body: [] }
        : { kind: "if", expr, body: [], alt: [] };
      push(node);
      stack.push({ kind: isEach ? "each" : "if", node, intoAlt: false });
      continue;
    }

    if (body === "else") {
      const frame = stack[stack.length - 1];
      if (!frame || frame.kind !== "if") {
        return { ok: false, error: "{{else}} outside an {{#if}}" };
      }
      frame.intoAlt = true;
      continue;
    }

    if (body === "/each" || body === "/if") {
      const expected = body === "/each" ? "each" : "if";
      const frame = stack.pop();
      if (!frame) return { ok: false, error: `{{${body}}} with no matching opening tag` };
      if (frame.kind !== expected) {
        return { ok: false, error: `{{${body}}} closes a {{#${frame.kind}}}` };
      }
      continue;
    }

    const expr = parseExpr(body);
    if (typeof expr === "string") return { ok: false, error: expr };
    push({ kind: "value", expr });
  }

  if (lastIndex < source.length) {
    push({ kind: "text", value: source.slice(lastIndex) });
  }

  if (stack.length > 0) {
    return { ok: false, error: `{{#${stack[stack.length - 1]!.kind}}} was never closed` };
  }

  return { ok: true, template: { nodes } };
}

/** Parse errors for a template, or null when it is well-formed. */
export function validateCollectionTemplate(source: string): string | null {
  const result = parseCollectionTemplate(source);
  return result.ok ? null : result.error;
}

// --- Rendering -------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function lookup(path: string[], scopes: unknown[]): unknown {
  // Innermost scope first, so a row's own field wins over the outer context.
  for (let i = scopes.length - 1; i >= 0; i--) {
    let value: unknown = scopes[i];
    let found = true;
    for (const key of path) {
      // Own properties only: a template must not be able to walk to
      // `constructor` or `__proto__` and pull something off the prototype chain.
      if (value == null || typeof value !== "object" || !Object.hasOwn(value, key)) {
        found = false;
        break;
      }
      value = (value as Record<string, unknown>)[key];
    }
    if (found) return value;
  }
  return undefined;
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function evaluate(expr: Expr, scopes: unknown[], ctx: TemplateHelperContext): string {
  const raw = stringify(lookup(expr.path, scopes));
  if (expr.kind === "path") return raw;
  return HELPERS[expr.name]!(raw, ctx);
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function renderNodes(
  nodes: Node[],
  scopes: unknown[],
  ctx: TemplateHelperContext,
  out: string[],
): void {
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out.push(node.value);
        break;
      case "value":
        out.push(escapeHtml(evaluate(node.expr, scopes, ctx)));
        break;
      case "each": {
        const value = lookup(node.expr.path, scopes);
        if (!Array.isArray(value)) break;
        for (const item of value) {
          renderNodes(node.body, [...scopes, item], ctx, out);
        }
        break;
      }
      case "if": {
        const value = lookup(node.expr.path, scopes);
        renderNodes(truthy(value) ? node.body : node.alt, scopes, ctx, out);
        break;
      }
    }
  }
}

export interface RenderCollectionOptions extends TemplateHelperContext {
  rows: Record<string, unknown>[];
}

/**
 * Render rows through a template.
 *
 * Throws only on a template that does not parse — the caller turns that into a
 * visible message. Everything else degrades: a missing field is empty, a
 * non-array `{{#each}}` renders nothing.
 */
export function renderCollectionTemplate(
  source: string,
  { rows, urlPrefix }: RenderCollectionOptions,
): string {
  const parsed = parseCollectionTemplate(source);
  if (!parsed.ok) throw new Error(parsed.error);

  const out: string[] = [];
  renderNodes(parsed.template.nodes, [{ rows }], { urlPrefix }, out);
  return out.join("");
}

/** The template a new custom collection starts from. */
export const DEFAULT_COLLECTION_TEMPLATE = `{{#each rows}}
  <article class="post-preview">
    <time class="post-date">{{date date}}</time>
    <h2 class="post-title"><a href="{{postUrl slug}}">{{title}}</a></h2>
    {{#if excerpt}}<p class="post-excerpt">{{excerpt}}</p>{{/if}}
    <a class="read-more" href="{{postUrl slug}}">read more &rarr;</a>
  </article>
{{/each}}`;
