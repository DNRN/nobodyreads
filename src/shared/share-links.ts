/**
 * Web-intent URLs for sharing a link. One builder for the public share bar and
 * the editor's "It's live" panel, so the two never disagree about a network's
 * URL format. Client-safe: no imports.
 */
export function shareIntentUrls(url: string, title: string): {
  x: string;
  bluesky: string;
  facebook: string;
  linkedin: string;
} {
  const encodedUrl = encodeURIComponent(url);
  return {
    x: `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(title)}`,
    bluesky: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  };
}
