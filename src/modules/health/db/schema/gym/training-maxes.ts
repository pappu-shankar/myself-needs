import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { gymExercises } from "./exercises";

/**
 * A training max the user set (or accepted) for percentage programming. Later
 * cycle bumps are derived from logged AMRAP results (engine/wendler.ts), not
 * written back — a new row only when the user resets it.
 */
export const gymTrainingMaxes = sqliteTable(
  "health_training_maxes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => gymExercises.id, { onDelete: "cascade" }),
    trainingMaxKg: real("training_max_kg").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("health_training_maxes_exercise_idx").on(table.exerciseId, table.effectiveFrom),
  ],
);
