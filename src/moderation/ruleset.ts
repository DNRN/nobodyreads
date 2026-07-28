import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Default path (relative to cwd) where the moderation ruleset is looked up. */
export const DEFAULT_RULESET_PATH = join("config", "ruleset.md");

/**
 * Resolves the ruleset text a comment is judged against.
 *
 * Returning `null` disables moderation for that tenant — the comment
 * publishes unchecked. The `tenantId` argument exists so a multi-tenant host
 * can vary the ruleset per plot; single-tenant deployments ignore it.
 */
export type RulesetSource = (
  tenantId: string,
) => string | null | Promise<string | null>;

function rulesetPath(): string {
  return (
    process.env.MODERATION_RULESET ||
    join(process.cwd(), DEFAULT_RULESET_PATH)
  );
}

// Cache keyed by path, invalidated on mtime change. The file is read on every
// comment submission, but it changes about as often as a deploy — for a
// self-hoster editing `config/ruleset.md` live, the stat picks the edit up on
// the next comment with no restart.
interface CacheEntry {
  mtimeMs: number;
  text: string | null;
}
const cache = new Map<string, CacheEntry>();

/** Drop the cached ruleset. Exposed for tests and for hosts that hot-reload. */
export function clearRulesetCache(): void {
  cache.clear();
}

/**
 * Read the ruleset markdown from disk, or `null` when no file is present.
 *
 * The absence of the file is the off switch: a deployment that never writes
 * `config/ruleset.md` runs with moderation disabled and needs no other
 * configuration. Read errors are logged and treated as absence rather than
 * thrown — a permissions slip on the ruleset should not take down commenting.
 */
export function loadRulesetFile(): string | null {
  const path = rulesetPath();
  if (!existsSync(path)) {
    cache.delete(path);
    return null;
  }

  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return cache.get(path)?.text ?? null;
  }

  const cached = cache.get(path);
  if (cached && cached.mtimeMs === mtimeMs) return cached.text;

  let text: string | null;
  try {
    text = readFileSync(path, "utf8").trim() || null;
  } catch (err) {
    console.error(`Failed to read moderation ruleset at ${path}:`, err);
    text = null;
  }

  cache.set(path, { mtimeMs, text });
  return text;
}

/**
 * The default {@link RulesetSource}: one ruleset file per deployment, shared
 * by every tenant. Hosts that source rules elsewhere (a platform-wide policy
 * file, a per-tenant record) pass their own source instead.
 */
export const fileRulesetSource: RulesetSource = () => loadRulesetFile();
