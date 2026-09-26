import { getDb } from "@/modules/core/db/client";
import { insurancePolicies } from "../../schema/domain/insurance-policies";

export type NewInsurancePolicy = typeof insurancePolicies.$inferInsert;

export function insertInsurancePolicy(entry: NewInsurancePolicy) {
  return getDb().insert(insurancePolicies).values(entry).returning().get();
}

export function listInsurancePolicies() {
  return getDb().select().from(insurancePolicies).orderBy(insurancePolicies.renewalDate).all();
}
