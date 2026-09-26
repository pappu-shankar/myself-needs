import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as {
  __sqliteConnection?: Database.Database;
  __drizzleDb?: BetterSQLite3Database;
};

/** Points `getDb()` at a fresh in-memory database with all migrations applied — call in `beforeEach`. */
export function setupTestDb(): void {
  globalForDb.__sqliteConnection?.close();

  const connection = new Database(":memory:");
  connection.pragma("foreign_keys = ON");
  globalForDb.__sqliteConnection = connection;
  globalForDb.__drizzleDb = drizzle(connection);
  migrate(globalForDb.__drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });
}

/** Call in `afterEach` to release the in-memory database. */
export function teardownTestDb(): void {
  globalForDb.__sqliteConnection?.close();
  globalForDb.__sqliteConnection = undefined;
  globalForDb.__drizzleDb = undefined;
}
