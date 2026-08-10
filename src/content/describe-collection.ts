/**
 * A collection's rule, in words.
 *
 * The Collections list shows what each collection *does* rather than its
 * configuration, because "newest first · 5 posts" is answerable at a glance and
 * `{"order":"newest","limit":5}` is not. Kept beside the types so a new config
 * field has an obvious place to be described.
 */
import type { ContentView, CustomViewConfig, PostListViewConfig } from "./types.js";

export function describeCollection(view: ContentView): string {
  if (view.kind === "custom") {
    const config = view.config as CustomViewConfig;
    const rows = config.query ? "custom query" : "no query yet";
    return capitalise(rows);
  }

  const config = view.config as PostListViewConfig;
  const parts = ["newest first"];
  if (typeof config.limit === "number" && config.limit > 0) {
    parts.unshift(`latest ${config.limit}`);
  } else {
    parts.unshift("all posts");
  }
  return capitalise(parts.join(" · "));
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
