export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function pagePath(
  page: { kind: string; slug: string },
  urlPrefix: string = ""
): string {
  if (page.kind === "home") return urlPrefix || "/";
  if (page.kind === "post") return `${urlPrefix}/posts/${page.slug}`;
  return `${urlPrefix}/${page.slug}`;
}
