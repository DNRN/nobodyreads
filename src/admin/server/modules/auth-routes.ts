import type { Hono, Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginFormSchema } from "../../../db/validation.js";
import {
  verifyEditorPassword,
  buildSessionCookie,
  buildClearSessionCookies,
} from "../auth.js";
import type { AdminModuleContext } from "./types.js";

export function mountAuthRoutes(app: Hono, ctx: AdminModuleContext): void {
  const { adminBase } = ctx;

  app.post(
    "/login",
    zValidator("form", loginFormSchema, (result, c) => {
      if (!result.success) {
        return c.redirect(`${adminBase}/login?error=1`);
      }
    }),
    async (c) => {
      const { password } = c.req.valid("form");

      if (!verifyEditorPassword(password)) {
        return c.redirect(`${adminBase}/login?error=1`);
      }

      const urlPrefix = adminBase.replace(/\/admin$/, "") || "/";
      c.header("Set-Cookie", buildSessionCookie(urlPrefix));
      return c.redirect(adminBase);
    }
  );

  app.get("/logout", (c) => clearSessionAndRedirect(c, adminBase));
  app.post("/logout", (c) => clearSessionAndRedirect(c, adminBase));
}

function clearSessionAndRedirect(c: Context, adminBase: string): Response {
  for (const cookie of buildClearSessionCookies(adminBase)) {
    c.header("Set-Cookie", cookie, { append: true });
  }
  return c.redirect(adminBase);
}
