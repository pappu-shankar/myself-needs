import Database from "better-sqlite3-multiple-ciphers";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { setTestDefaultDatabase } from "@/modules/core/db/client";
import { getMigrationsDir } from "@/modules/core/env/paths";

/** Points `getDb()` (outside any request scope) at a fresh in-memory database with
 * all migrations applied — call in `beforeEach`. */
export function setupTestDb(): void {
  const connection = new Database(":memory:");
  connection.pragma("foreign_keys = ON");
  const db = setTestDefaultDatabase(connection)!;
  migrate(db, { migrationsFolder: getMigrationsDir() });
}

/** Call in `afterEach` to release the in-memory database. */
export function teardownTestDb(): void {
  setTestDefaultDatabase(null);
}
