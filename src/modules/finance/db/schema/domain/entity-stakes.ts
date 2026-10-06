import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { entities } from "./entities";

/**
 * Who owns how much of an entity, over time.
 *
 * `ownership_bps` is integer basis points (7000 = 70%), never a float
 * percentage: stakes are multipliers on money, and a REAL percentage
 * reintroduces exactly the drift that integer money storage exists to remove.
 *
 * Dated, because a stake changes — a founder's holding dilutes across rounds.
 * Net worth as of 2024 must use the 2024 stake, so a change is a new row and
 * never an overwrite of the old one.
 */
export const entityStakes = sqliteTable(
  "finance_entity_stakes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The entity being owned. */
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    /** The entity doing the owning. */
    holderEntityId: integer("holder_entity_id")
      .notNull()
      .references(() => entities.id),
    ownershipBps: integer("ownership_bps").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    /** Null = still current. */
    effectiveTo: text("effective_to"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("finance_entity_stakes_entity_from_idx").on(table.entityId, table.effectiveFrom),
    index("finance_entity_stakes_holder_idx").on(table.holderEntityId),
  ],
);
