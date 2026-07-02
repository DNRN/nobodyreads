export { createCommentRoutes } from "./routes.js";
export type { CommentRouterOptions } from "./routes.js";
export {
  listComments,
  getCommentById,
  createComment,
  softDeleteComment,
  setPinnedComment,
  countRecentCommentsByMember,
} from "./db.js";
export type { Comment, NewComment } from "./types.js";
