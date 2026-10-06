import { count, isNotNull } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymExercises } from "../../schema/gym/exercises";

export type NewGymExercise = typeof gymExercises.$inferInsert;

/** Connections already checked — the drizzle instance is new per open vault / test DB. */
const seeded = new WeakSet<object>();

const CHUNK = 200;

/**
 * Inserts every catalog row whose `catalog_key` isn't present yet. Idempotent
 * and cheap after the first call per connection (one COUNT, then a WeakSet hit).
 */
export function seedCatalogRows(rows: readonly NewGymExercise[]): void {
  const db = getDb();
  if (seeded.has(db)) return;
  const present =
    db.select({ n: count() }).from(gymExercises).where(isNotNull(gymExercises.catalogKey)).get()
      ?.n ?? 0;
  if (present < rows.length) {
    db.transaction((tx) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        tx.insert(gymExercises)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoNothing()
          .run();
      }
    });
  }
  seeded.add(db);
}
