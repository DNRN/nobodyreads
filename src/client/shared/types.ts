// Client-side mirrors of the JSON the community/comment routes return.
// Kept deliberately minimal — only the fields the widgets read. The
// authoritative shapes live in src/community/routes.ts.

export interface MembershipState {
  /** Present when a reader is signed in; null for anonymous visitors. */
  member: { issuer: string; displayName: string } | null;
  joined: boolean;
  memberCount: number;
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
  mine: boolean;
  /** Populated client-side by buildTree(); absent in the raw response. */
  children?: CommentNode[];
}

export interface CommentThread {
  comments: CommentNode[];
}
