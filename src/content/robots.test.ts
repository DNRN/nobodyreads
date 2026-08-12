import { describe, it, expect } from "vitest";
import { buildRobotsTxt } from "./robots.js";
import {
  resolveSiteDiscovery,
  SETTING_SEARCH_INDEXING,
  SETTING_AI_TRAINING,
  SETTING_ROBOTS_TXT,
} from "../shared/site-settings.js";

describe("resolveSiteDiscovery", () => {
  it("allows indexing and AI training when nothing is stored", () => {
    expect(resolveSiteDiscovery({})).toEqual({
      searchIndexing: true,
      aiTraining: true,
      robotsTxt: null,
    });
  });

  it("treats only the literal 'off' as opting out", () => {
    expect(resolveSiteDiscovery({ [SETTING_SEARCH_INDEXING]: "off" }).searchIndexing).toBe(false);
    expect(resolveSiteDiscovery({ [SETTING_SEARCH_INDEXING]: "on" }).searchIndexing).toBe(true);
    expect(resolveSiteDiscovery({ [SETTING_AI_TRAINING]: "off" }).aiTraining).toBe(false);
  });

  it("ignores a whitespace-only robots override", () => {
    expect(resolveSiteDiscovery({ [SETTING_ROBOTS_TXT]: "   \n " }).robotsTxt).toBeNull();
  });

  it("keeps a real robots override verbatim", () => {
    const body = "User-agent: *\nDisallow: /private";
    expect(resolveSiteDiscovery({ [SETTING_ROBOTS_TXT]: body }).robotsTxt).toBe(body);
  });
});

describe("buildRobotsTxt", () => {
  it("allows everything and advertises the sitemap by default", () => {
    const txt = buildRobotsTxt({
      searchIndexing: true,
      aiTraining: true,
      sitemapUrl: "https://example.com/sitemap.xml",
    });
    expect(txt).toContain("User-agent: *\nAllow: /");
    expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(txt).not.toContain("GPTBot");
  });

  it("disallows everything when indexing is off", () => {
    const txt = buildRobotsTxt({ searchIndexing: false, aiTraining: true });
    expect(txt).toContain("User-agent: *\nDisallow: /");
    expect(txt).not.toContain("Allow: /");
  });

  it("omits the sitemap when indexing is off", () => {
    const txt = buildRobotsTxt({
      searchIndexing: false,
      aiTraining: true,
      sitemapUrl: "https://example.com/sitemap.xml",
    });
    expect(txt).not.toContain("Sitemap:");
  });

  it("blocks AI crawlers as one group without touching search crawlers", () => {
    const txt = buildRobotsTxt({ searchIndexing: true, aiTraining: false });
    for (const agent of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "PerplexityBot"]) {
      expect(txt).toContain(`User-agent: ${agent}`);
    }
    // Search engines keep their Allow — opting out of training is not opting
    // out of being found.
    expect(txt).toContain("User-agent: *\nAllow: /");
    expect(txt).not.toContain("User-agent: Googlebot");
  });

  it("ends with a newline so the file is well formed", () => {
    expect(buildRobotsTxt({ searchIndexing: true, aiTraining: true })).toMatch(/\n$/);
  });
});
