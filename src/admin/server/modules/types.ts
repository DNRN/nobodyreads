import type { Database } from "../../../db/index.js";
import type { MediaStorage } from "../../../media/storage.js";

export interface AdminModuleContext {
  db: Database;
  storage?: MediaStorage;
  tenantId: string;
  adminBase: string;
  editorBase: string;
}
