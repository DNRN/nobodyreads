import type { MemberIdentity } from "../community/types.js";

/** A single comment as stored, before mapping to a public response shape. */
export interface Comment {
  id: string;
  pageId: string;
  parentId: string | null;
  author: MemberIdentity;
  body: string;
  createdAt: string;
  updatedAt?: string;
  /** True when the comment was soft-deleted (body should be hidden). */
  deleted: boolean;
  /** True when the plot owner has pinned this comment (shown first). */
  pinned: boolean;
}

/** Input for creating a comment. */
export interface NewComment {
  pageId: string;
  parentId?: string | null;
  identity: MemberIdentity;
  body: string;
}
