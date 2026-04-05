import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { siteTemplateFormSchema } from "../../../db/validation.js";
import {
  getSiteTemplate,
  addSiteTemplateRevision,
  deleteSiteTemplateRevision,
  setCurrentSiteTemplateRevision,
} from "../../../shared/site-bundle.js";
import { getSiteSettings, setSiteSetting, deleteSiteSetting } from "../../../shared/site-settings.js";
import { validateTheme, themeHasScripts } from "../../../template/theme-io.js";
import { DEFAULT_TEMPLATE } from "../../../template/defaults.js";
import type { AdminModuleContext } from "./types.js";

export function createThemeRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, adminBase } = ctx;
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

    await addSiteTemplateRevision(db, template as import("../../../template/types.js").SiteTemplateDefinition, tenantId);
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
    await deleteSiteTemplateRevision(db, revisionId, tenantId);
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
