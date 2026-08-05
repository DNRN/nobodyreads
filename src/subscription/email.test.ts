import { describe, it, expect, vi } from "vitest";
import { sendNewPostNotification } from "./email.js";
import type { EmailProvider, EmailMessage } from "./email.js";

/**
 * These tests exist to stop one specific future mistake.
 *
 * `sendNewPostNotification` mails **every verified subscriber**, free ones
 * included. Its `post` parameter is a narrow `{ title, slug, excerpt }`, so a
 * paid body is not merely withheld — it is not representable. The obvious
 * "improvement" is to widen it to `post: Page` for convenience, at which point
 * publishing a paid post emails its full text to everyone who ever subscribed.
 *
 * The assertions below pin the payload shape so that widening breaks a test
 * instead of a business.
 */

function captureProvider(): { provider: EmailProvider; sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    sendEmail: vi.fn(async (message: EmailMessage) => {
      sent.push(message);
    }),
  };
  return { provider, sent };
}

const subscribers = [
  { id: "s1", email: "reader@example.com", verified: true, createdAt: "2026-01-01" },
] as never;

describe("new-post notification payload", () => {
  it("sends the title, a link and the excerpt — and nothing else from the post", async () => {
    const { provider, sent } = captureProvider();

    await sendNewPostNotification(
      provider,
      "https://example.com",
      "Example",
      { title: "A paid post", slug: "a-paid-post", excerpt: "The public teaser." },
      subscribers,
    );

    expect(sent).toHaveLength(1);
    const body = `${sent[0].html ?? ""}${sent[0].text ?? ""}`;
    expect(body).toContain("A paid post");
    expect(body).toContain("The public teaser.");
    expect(body).toContain("https://example.com/posts/a-paid-post");
  });

  it("cannot be handed a body — the parameter has no content field", async () => {
    const { provider, sent } = captureProvider();

    // Structurally typed, so an object carrying `content` is still accepted at
    // runtime; the point is that nothing reads it. If a future refactor starts
    // rendering `post.content`, this fails.
    await sendNewPostNotification(
      provider,
      "https://example.com",
      "Example",
      {
        title: "A paid post",
        slug: "a-paid-post",
        excerpt: "The public teaser.",
        content: "PAID BODY THAT MUST NEVER BE MAILED",
      } as never,
      subscribers,
    );

    const body = `${sent[0].html ?? ""}${sent[0].text ?? ""}`;
    expect(body).not.toContain("PAID BODY THAT MUST NEVER BE MAILED");
  });

  it("omits the excerpt paragraph entirely when there is none", async () => {
    const { provider, sent } = captureProvider();

    await sendNewPostNotification(
      provider,
      "https://example.com",
      "Example",
      { title: "Untitled thoughts", slug: "untitled", excerpt: "" },
      subscribers,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("Untitled thoughts");
  });
});
