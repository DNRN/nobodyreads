import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "./schema/index.js";

export type Database = LibSQLDatabase<typeof schema>;
