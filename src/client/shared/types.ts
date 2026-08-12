// Client-side mirrors of the JSON the community/comment routes return.
// Kept deliberately minimal — only the fields the widgets read. The
// authoritative shapes live in src/community/routes.ts.

export interface MembershipState {
  /** Present when a reader is signed in; null for anonymous visitors. */
  member: { issuer: string; displayName: string } | null;
  joined: boolean;
  memberCount: number;
  /** True when the viewer owns this plot — they can't join their own space. */
  isOwner: boolean;
}

export interface LikeState {
  count: number;
  likedByMe: boolean;
}

export interface CommentNode {
  id: string;
  parentId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  pinned: boolean;
  /** True when the comment is held for moderation review (author-only view). */
  pending?: boolean;
  mine: boolean;
  /** Populated client-side by buildTree(); absent in the raw response. */
  children?: CommentNode[];
}

export interface CommentThread {
  comments: CommentNode[];
  /**
   * True when the post is gated and this reader cannot see it. The thread is
   * empty in that case — the server never sends comments the reader is not
   * entitled to, so the widget renders a prompt rather than "0 comments".
   */
  gated?: boolean;
  /** "members" | "paid" when `gated`, so the prompt can say which. */
  accessTier?: string;
}
