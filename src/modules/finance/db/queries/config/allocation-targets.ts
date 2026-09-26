import { getDb } from "@/modules/core/db/client";
import { allocationTargets } from "../../schema/config/allocation-targets";

export function listAllocationTargets() {
  return getDb().select().from(allocationTargets).all();
}

export function upsertAllocationTarget(
  assetClass: "equity" | "debt" | "gold" | "cash",
  targetPercentage: number,
) {
  return getDb()
    .insert(allocationTargets)
    .values({ assetClass, targetPercentage })
    .onConflictDoUpdate({ target: allocationTargets.assetClass, set: { targetPercentage } })
    .returning()
    .get();
}
