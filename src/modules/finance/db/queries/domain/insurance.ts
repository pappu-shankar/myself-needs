import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { insurancePolicies } from "../../schema/domain/insurance-policies";
import { transactions } from "../../schema/domain/transactions";
import { unarchived, type LifecycleScope } from "../lifecycle";

export type NewInsurancePolicy = typeof insurancePolicies.$inferInsert;

export function insertInsurancePolicy(entry: NewInsurancePolicy) {
  return getDb().insert(insurancePolicies).values(entry).returning().get();
}

/** Policies still in force. An archived (lapsed, surrendered) policy is kept —
 * its premium history references it — but stays out of listings and pickers
 * unless explicitly asked for. */
export function listInsurancePolicies(scope: LifecycleScope = {}) {
  const query = getDb().select().from(insurancePolicies);
  return (scope.includeArchived ? query : query.where(unarchived(insurancePolicies.archivedAt)))
    .orderBy(insurancePolicies.renewalDate)
    .all();
}

export function getInsurancePolicyById(id: number) {
  return getDb().select().from(insurancePolicies).where(eq(insurancePolicies.id, id)).get();
}

export function updateInsurancePolicy(id: number, patch: Partial<Omit<NewInsurancePolicy, "id">>) {
  return getDb()
    .update(insurancePolicies)
    .set(patch)
    .where(eq(insurancePolicies.id, id))
    .returning()
    .get();
}

/** `null` un-archives. One function for both directions so the column is only
 * ever written in one place. */
export function archiveInsurancePolicy(id: number, archivedAt: string | null) {
  return getDb()
    .update(insurancePolicies)
    .set({ archivedAt })
    .where(eq(insurancePolicies.id, id))
    .returning()
    .get();
}

/**
 * Whether this policy has premium history behind it.
 *
 * Nothing holds a foreign key *to* a policy — the link runs the other way, from
 * the policy to the recurring rule that schedules its premium — so the real
 * reference is indirect: a confirmed premium is a transaction tagged with that
 * rule, and the policy is the only thing that says what the payment was for
 * (it is exactly this join that `getInsurancePremiumsPaidByCurrency` uses to
 * compute the 80C/80D deduction). Deleting the policy would leave those
 * transactions unexplained and the deduction unattributable.
 *
 * Voided transactions count, for the same reason they do everywhere else here:
 * a void is a correction trail, and the trail still needs its policy.
 */
export function insurancePolicyHasPremiumHistory(id: number): boolean {
  const policy = getInsurancePolicyById(id);
  if (!policy?.recurringRuleId) return false;
  return (
    getDb()
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.recurringRuleId, policy.recurringRuleId))
      .get() !== undefined
  );
}

/** Only reached for a policy with no premium history — the service checks first. */
export function deleteInsurancePolicy(id: number) {
  getDb().delete(insurancePolicies).where(eq(insurancePolicies.id, id)).run();
}
