import { asc, eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { entities } from "../../schema/domain/entities";
import { entityStakes } from "../../schema/domain/entity-stakes";
import { unarchived, type LifecycleScope } from "../lifecycle";
import type { Stake } from "../../../service/utility/ownership";

export type NewEntity = typeof entities.$inferInsert;
export type NewEntityStake = typeof entityStakes.$inferInsert;
export type EntityRow = typeof entities.$inferSelect;

export function listEntities(scope: LifecycleScope = {}) {
  const query = getDb().select().from(entities);
  return (scope.includeArchived ? query : query.where(unarchived(entities.archivedAt)))
    .orderBy(asc(entities.id))
    .all();
}

export function getEntityById(id: number) {
  return getDb().select().from(entities).where(eq(entities.id, id)).get();
}

/** The `Self` entity, seeded by migration 0027. Every pre-existing account and
 * holding was attributed to it, so it is the anchor for "my" net worth. */
export function getSelfEntity() {
  return getDb()
    .select()
    .from(entities)
    .where(eq(entities.kind, "personal"))
    .orderBy(asc(entities.id))
    .get();
}

export function insertEntity(entry: NewEntity) {
  return getDb().insert(entities).values(entry).returning().get();
}

/**
 * Every stake row, for the dated lookup in `service/utility/ownership.ts`.
 *
 * Returned whole rather than resolved per entity in SQL: "the stake in force on
 * this date" is a correlated subquery per entity per date, and a net-worth
 * trend asks it for twelve dates. One read, then an in-memory lookup.
 */
export function listEntityStakes(): Stake[] {
  return getDb()
    .select({
      entityId: entityStakes.entityId,
      holderEntityId: entityStakes.holderEntityId,
      ownershipBps: entityStakes.ownershipBps,
      effectiveFrom: entityStakes.effectiveFrom,
      effectiveTo: entityStakes.effectiveTo,
    })
    .from(entityStakes)
    .all();
}

export function insertEntityStake(entry: NewEntityStake) {
  return getDb().insert(entityStakes).values(entry).returning().get();
}
