import { describe, it, expect } from "vitest";
import { buildAdminNav, buildCreateMenu, contentListHref, type AdminNavGroup } from "./context.js";
import { POST_FORMATS } from "../content/formats.js";

const base = { adminBase: "/admin" };

function activeIds(groups: AdminNavGroup[]): string[] {
  return groups.flatMap((g) => g.items.filter((i) => i.active).map((i) => i.id));
}

function ids(groups: AdminNavGroup[], group: AdminNavGroup["id"]): string[] {
  return groups.find((g) => g.id === group)!.items.map((i) => i.id);
}

describe("buildAdminNav", () => {
  it("appends host items to their named group, after the engine's own", () => {
    const nav = buildAdminNav(
      {
        ...base,
        hostNav: [
          { group: "settings", label: "Account", href: "/admin/account" },
          { group: "audience", label: "Payouts", href: "/admin/account/payouts" },
          { group: "settings", label: "Billing", href: "/admin/account/billing" },
        ],
      },
      { pathname: "/admin" }
    );
    expect(ids(nav, "settings")).toEqual(["design", "site", "host:Account", "host:Billing"]);
    expect(ids(nav, "audience")).toEqual(["subscribers", "comments", "host:Payouts"]);
  });

  it("lists Earnings only when the host can take payments", () => {
    expect(ids(buildAdminNav(base, { pathname: "/admin" }), "audience")).not.toContain("earnings");
    expect(
      ids(buildAdminNav({ ...base, paymentsEnabled: true }, { pathname: "/admin" }), "audience")
    ).toContain("earnings");
  });

  it("tells the Posts and Pages lists apart by their kind filter", () => {
    const posts = buildAdminNav(base, { pathname: "/admin/editor", search: "?kind=post" });
    expect(activeIds(posts)).toEqual(["posts"]);
    const pages = buildAdminNav(base, { pathname: "/admin/editor", search: "?kind=page" });
    expect(activeIds(pages)).toEqual(["pages"]);
  });

  it("marks only the dashboard on the admin root, and never as a prefix", () => {
    expect(activeIds(buildAdminNav(base, { pathname: "/admin/" }))).toEqual(["dashboard"]);
    expect(activeIds(buildAdminNav(base, { pathname: "/admin/media" }))).toEqual(["media"]);
    expect(activeIds(buildAdminNav(base, { pathname: "/admin/unknown" }))).toEqual([]);
  });

  it("highlights the most specific of nested host items, once", () => {
    const nav = buildAdminNav(
      {
        ...base,
        hostNav: [
          { group: "settings", label: "Account", href: "/admin/account" },
          { group: "settings", label: "Payouts", href: "/admin/account/payouts" },
        ],
      },
      { pathname: "/admin/account/payouts/connect" }
    );
    expect(activeIds(nav)).toEqual(["host:Payouts"]);
  });

  it("lets a page name its section when the URL cannot (editing a page by id)", () => {
    const nav = buildAdminNav(base, {
      pathname: "/admin/editor/abc123",
      activeHref: contentListHref("/admin", "page"),
    });
    expect(activeIds(nav)).toEqual(["pages"]);
  });
});

describe("buildCreateMenu", () => {
  it("starts a text post on the main click and offers every format, each to its own editor", () => {
    const menu = buildCreateMenu({ adminBase: "/admin", editorBase: "/admin/editor" });
    expect(menu.primary.href).toBe("/admin/editor/new");

    const formatItems = menu.items.slice(0, POST_FORMATS.length);
    expect(formatItems.map((i) => i.id)).toEqual(POST_FORMATS.map((f) => f.id));
    expect(new Set(formatItems.map((i) => i.href)).size).toBe(POST_FORMATS.length);
    expect(formatItems.find((i) => i.id === "audio")?.href).toBe("/admin/editor/new?format=audio");
  });
});
