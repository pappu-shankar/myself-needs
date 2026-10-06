import path from "node:path";
import { attachRegistryDb, openRegistryDb, type RegistryDb } from "./accounts-db";
import { resetAccountStatusCache } from "./accounts-store";
import { resetAuditPruneCounter } from "./audit-store";
import { resetThrottleMemory } from "./throttle";

/**
 * Test harness for the account registry. `setupTestRegistry()` (in
 * `beforeEach`) points every store at a fresh, fully migrated in-memory
 * database — or a file in `dir` when a test needs several connections — and
 * clears the in-memory caches/windows. `teardownTestRegistry()` closes it.
 */
export function setupTestRegistry(options: { dir?: string } = {}): RegistryDb {
  const db = openRegistryDb(options.dir ? path.join(options.dir, "accounts.db") : ":memory:");
  attachRegistryDb(db);
  resetAccountStatusCache();
  resetThrottleMemory();
  resetAuditPruneCounter();
  return db;
}

export function teardownTestRegistry(): void {
  attachRegistryDb(null);
  resetAccountStatusCache();
  resetThrottleMemory();
}
