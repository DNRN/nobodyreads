import { describe, it, expect } from "vitest";
import { buildMetaTags, buildStructuredData } from "./seo.js";
import type { LayoutOptions, Page } from "../content/types.js";

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    slug: "hello-world",
    title: "Hello World",
    content: "# Hello",
    excerpt: "A greeting",
    tags: [],
    date: "2025-01-15",
    published: true,
    kind: "post",
    ...overrides,
  };
}

function makeOptions(overrides: Partial<LayoutOptions> = {}): LayoutOptions {
  return {
    title: "Hello World",
    navItems: [],
    ...overrides,
  };
}

describe("social share image resolution", () => {
  it("uses the first in-post image when no explicit ogImage is set", () => {
    const page = makePage({
      content: "Some intro text.\n\n![a photo](/media/first.jpg)\n\nMore text.\n\n![another](/media/second.jpg)",
    });
    const options = makeOptions({ page });

    expect(buildMetaTags(options)).toContain(
      'property="og:image" content="http://localhost:3000/media/first.jpg"'
    );
  });

  it("prefers an explicit seo.ogImage over an in-post image", () => {
    const page = makePage({
      seo: { ogImage: "/media/chosen.jpg" },
      content: "![inline](/media/first.jpg)",
    });
    const options = makeOptions({ page, seo: page.seo });

    expect(buildMetaTags(options)).toContain(
      'property="og:image" content="http://localhost:3000/media/chosen.jpg"'
    );
  });

  it("falls back to the site-wide default when the post has no images", () => {
    const page = makePage({ content: "Just text, no images here." });
    const options = makeOptions({ page, defaultOgImage: "/media/site-default.jpg" });

    expect(buildMetaTags(options)).toContain(
      'property="og:image" content="http://localhost:3000/media/site-default.jpg"'
    );
  });

  it("carries the same resolved image into BlogPosting structured data", () => {
    const page = makePage({ content: "![cover](/media/first.jpg)" });
    const options = makeOptions({ page });

    expect(buildStructuredData(options)).toContain(
      '"image":"http://localhost:3000/media/first.jpg"'
    );
  });
});

// ---------- Paywall contract ----------

describe("og:image and gated pages", () => {
  // `resolveOgImage` deliberately knows nothing about access tiers. The
  // guarantee is upstream: every caller passes the page returned by
  // `getReadableContent`, whose content is already the teaser. These two tests
  // pin both halves of that contract.

  it("does not surface an image from below the paywall, given a redacted page", async () => {
    const { redactPage } = await import("../payments/access.js");

    const raw = makePage({
      accessTier: "paid",
      excerpt: "A teaser with no image.",
      content: "Free intro.\n\n<!--paywall-->\n\n![secret](/media/below-the-cut.jpg)",
    });

    const safe = redactPage(raw, {
      visibility: "teaser",
      reason: "payment_required",
      tier: null,
      priceAmount: null,
      currency: "eur",
    });

    const html = buildMetaTags(makeOptions({ page: safe }));
    expect(html).not.toContain("below-the-cut.jpg");
  });

  it("still surfaces it for an entitled reader, whose page is not redacted", async () => {
    const { redactPage } = await import("../payments/access.js");

    const raw = makePage({
      accessTier: "paid",
      content: "![cover](/media/paid-cover.jpg)",
    });
    const safe = redactPage(raw, { visibility: "full", reason: "entitled" });

    expect(buildMetaTags(makeOptions({ page: safe }))).toContain("paid-cover.jpg");
  });
});

describe("per-request site origin", () => {
  it("builds the canonical from options.siteUrl when given", () => {
    const options = makeOptions({
      siteUrl: "https://alice.example.com",
      pathname: "/posts/hello-world",
    });

    expect(buildMetaTags(options)).toContain(
      'rel="canonical" href="https://alice.example.com/posts/hello-world"'
    );
  });

  it("lets options.siteUrl override the SITE_URL environment variable", () => {
    const previous = process.env.SITE_URL;
    process.env.SITE_URL = "https://env.example.com";
    try {
      const options = makeOptions({
        siteUrl: "https://alice.example.com",
        pathname: "/about",
      });

      const tags = buildMetaTags(options);
      expect(tags).toContain('property="og:url" content="https://alice.example.com/about"');
      expect(tags).not.toContain("env.example.com");
    } finally {
      if (previous === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = previous;
    }
  });

  it("falls back to SITE_URL when no siteUrl is passed", () => {
    const previous = process.env.SITE_URL;
    process.env.SITE_URL = "https://env.example.com";
    try {
      const options = makeOptions({ pathname: "/about" });

      expect(buildMetaTags(options)).toContain(
        'rel="canonical" href="https://env.example.com/about"'
      );
    } finally {
      if (previous === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = previous;
    }
  });

  it("tolerates a trailing slash on the supplied origin", () => {
    const options = makeOptions({
      siteUrl: "https://alice.example.com/",
      pathname: "/about",
    });

    expect(buildMetaTags(options)).toContain(
      'rel="canonical" href="https://alice.example.com/about"'
    );
  });

  it("uses options.siteUrl for absolute URLs in BlogPosting structured data", () => {
    const options = makeOptions({
      siteUrl: "https://alice.example.com",
      page: makePage(),
    });

    const json = JSON.parse(
      buildStructuredData(options).match(/>({.*})</)![1]
    ) as Record<string, unknown>;

    expect(json.url).toBe("https://alice.example.com/posts/hello-world");
    expect((json.mainEntityOfPage as Record<string, string>)["@id"]).toBe(
      "https://alice.example.com/posts/hello-world"
    );
    expect((json.publisher as Record<string, string>).url).toBe(
      "https://alice.example.com"
    );
  });

  it("absolutises a relative og:image against options.siteUrl", () => {
    const options = makeOptions({
      siteUrl: "https://alice.example.com",
      defaultOgImage: "/media/cover.jpg",
    });

    expect(buildMetaTags(options)).toContain(
      'property="og:image" content="https://alice.example.com/media/cover.jpg"'
    );
  });
});
