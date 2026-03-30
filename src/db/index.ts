import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "./schema.js";

export type Database = LibSQLDatabase<typeof schema>;
