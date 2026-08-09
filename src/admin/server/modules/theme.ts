import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { siteTemplateFormSchema } from "../../../db/validation.js";
import {
  getSiteTemplate,
  addSiteTemplateRevision,
  deleteSiteTemplateRevision,
  setCurrentSiteTemplateRevision,
  getCurrentSiteTemplateRevisionId,
  listSiteTemplateTrials,
  getSiteTemplateTrial,
  saveSiteTemplateTrial,
  deleteSiteTemplateTrial,
} from "../../../shared/site-bundle.js";
import {
  getSiteSettings,
  setSiteSetting,
  deleteSiteSetting,
  SITE_IDENTITY_FIELDS,
} from "../../../shared/site-settings.js";
import { validateTheme, themeHasScripts } from "../../../template/theme-io.js";
import { serializeRegistry } from "../../../template/registry.js";
import { DEFAULT_TEMPLATE } from "../../../template/defaults.js";
import type { AdminModuleContext } from "./types.js";

export function createThemeRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, adminBase, editorBase } = ctx;
  const app = new Hono();

  const saveSiteTemplate = async (c: Context) => {
    const body = await c.req.parseBody();
    const parsed = siteTemplateFormSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
    }

    let template: unknown;
    try {
      template = JSON.parse(parsed.data.template);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const validation = validateTheme(template);
    if (!validation.ok) {
      return c.json({ error: validation.error }, 400);
    }

    const revisionId = await addSiteTemplateRevision(db, validation.theme, tenantId);

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ ok: true, revisionId });
    }
    return c.redirect(`${adminBase}/layout`);
  };
  app.post("/site/save", saveSiteTemplate);
  app.post("/layout/save", saveSiteTemplate);

  const publishRevision = async (c: Context) => {
    const revisionId = parseInt(c.req.param("id") ?? "0", 10);
    await setCurrentSiteTemplateRevision(db, revisionId, tenantId);
    return c.redirect(`${adminBase}/layout`);
  };
  app.post("/site/revision/use/:id", publishRevision);
  app.post("/layout/revision/use/:id", publishRevision);
  app.post("/layout/revision/publish/:id", publishRevision);

  const deleteRevision = async (c: Context) => {
    const revisionId = parseInt(c.req.param("id") ?? "0", 10);

    // ?ifUnpublished=1 makes this a no-op when the revision is the currently
    // published one, so automated cleanup (e.g. the AI themer replacing its
    // auto-saved draft) can never re-point the live site.
    let deleted = true;
    if (c.req.query("ifUnpublished") != null) {
      const currentId = await getCurrentSiteTemplateRevisionId(db, tenantId);
      deleted = currentId !== revisionId;
    }
    if (deleted) {
      await deleteSiteTemplateRevision(db, revisionId, tenantId);
    }

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ ok: true, deleted });
    }
    return c.redirect(`${adminBase}/layout`);
  };
  app.post("/site/revision/delete/:id", deleteRevision);
  app.post("/layout/revision/delete/:id", deleteRevision);

  app.get("/theme/export", async (c) => {
    const template = (await getSiteTemplate(db, tenantId)) ?? DEFAULT_TEMPLATE;
    const filename = template.themeMeta?.name
      ? `${template.themeMeta.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`
      : "theme.json";
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.body(JSON.stringify(template, null, 2));
  });

  app.post("/theme/import", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;

    let raw: string;
    if (file instanceof File) {
      raw = await file.text();
    } else if (typeof body.theme === "string") {
      raw = body.theme;
    } else {
      return c.json({ error: "No theme data provided" }, 400);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const result = validateTheme(parsed);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    const revisionId = await addSiteTemplateRevision(db, result.theme, tenantId);
    const hasScripts = themeHasScripts(result.theme);

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ revisionId, hasScripts });
    }
    return c.redirect(`${adminBase}/layout`);
  });

  app.post("/settings/tokens", async (c) => {
    const body = await c.req.parseBody();

    for (const [key, value] of Object.entries(body)) {
      if (!key.startsWith("token:") || typeof value !== "string") continue;
      const tokenKey = key.slice("token:".length);
      const settingKey = `custom_token:${tokenKey}`;

      if (value.trim() === "") {
        await deleteSiteSetting(db, tenantId, settingKey);
      } else {
        await setSiteSetting(db, tenantId, settingKey, value);
      }
    }

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ ok: true });
    }
    return c.redirect(`${adminBase}/layout`);
  });

  app.post("/editor/site/save", async (c) => {
    const body = await c.req.parseBody();

    for (const field of SITE_IDENTITY_FIELDS) {
      const raw = body[field.formName];
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (value === "") {
        await deleteSiteSetting(db, tenantId, field.key);
      } else {
        await setSiteSetting(db, tenantId, field.key, value);
      }
    }

    for (const [key, value] of Object.entries(body)) {
      if (!key.startsWith("token:") || typeof value !== "string") continue;
      const tokenKey = key.slice("token:".length);
      const settingKey = `custom_token:${tokenKey}`;
      if (value.trim() === "") {
        await deleteSiteSetting(db, tenantId, settingKey);
      } else {
        await setSiteSetting(db, tenantId, settingKey, value);
      }
    }

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ ok: true });
    }
    return c.redirect(`${editorBase}/site?saved`);
  });

  // --- Saved theme trials --------------------------------------------------
  //
  // JSON throughout: the trials strip is a client-side control on the Design
  // screen, not a page of its own. Applying a trial is deliberately *not* a
  // route — the client loads the template into the editor as an unsaved draft,
  // so banking a look and publishing it stay two separate decisions.

  app.get("/design/trials", async (c) => {
    const trials = await listSiteTemplateTrials(db, tenantId);
    // The stored template can be large and the strip only needs to identify and
    // preview each entry, so the swatches come from the palette, not the body.
    return c.json({
      trials: trials.map((trial) => ({
        trialId: trial.trialId,
        name: trial.name,
        createdAt: trial.createdAt,
        swatches: [
          trial.template?.tokens?.light?.text,
          trial.template?.tokens?.light?.accent,
          trial.template?.tokens?.light?.bg,
        ].filter((value): value is string => typeof value === "string"),
      })),
    });
  });

  app.get("/design/trials/:id", async (c) => {
    const trial = await getSiteTemplateTrial(db, c.req.param("id"), tenantId);
    if (!trial) return c.json({ error: "No such trial" }, 404);
    return c.json({ trial });
  });

  app.post("/design/trials", async (c) => {
    const body = await c.req.json<{ name?: string; trialId?: string; template?: unknown }>()
      .catch(() => ({}) as { name?: string; trialId?: string; template?: unknown });

    const name = body.name?.trim();
    if (!name) return c.json({ error: "A name is required" }, 400);

    // Validated like any other saved theme: a trial is applied to the live
    // editor later, so junk here would surface as a broken Design screen.
    const validation = validateTheme(body.template);
    if (!validation.ok) return c.json({ error: validation.error }, 400);

    const trial = await saveSiteTemplateTrial(
      db,
      { trialId: body.trialId?.trim() || randomUUID(), name, template: validation.theme },
      tenantId,
    );
    return c.json({ ok: true, trial });
  });

  app.post("/design/trials/:id/delete", async (c) => {
    await deleteSiteTemplateTrial(db, c.req.param("id"), tenantId);
    return c.json({ ok: true });
  });

  app.get("/design/registry", (c) => {
    return c.json(serializeRegistry());
  });

  app.get("/settings/tokens", async (c) => {
    const settings = await getSiteSettings(db, tenantId);
    const tokens: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith("custom_token:")) {
        tokens[key.slice("custom_token:".length)] = value;
      }
    }
    return c.json(tokens);
  });

  return app;
}
