import {
  archiveInsurancePolicy,
  deleteInsurancePolicy,
  getInsurancePolicyById,
  insertInsurancePolicy,
  insurancePolicyHasPremiumHistory,
  listInsurancePolicies,
  updateInsurancePolicy,
  type NewInsurancePolicy,
} from "../../db/queries/domain/insurance";
import { DomainError } from "@/modules/core/errors";
import { todayIso } from "@/lib/dates";
import type { LifecycleScope } from "../../db/queries/lifecycle";
import { divRound, toSafeNumber } from "../utility/integer-math";
import type { Currency } from "../../db/schema/currency";

/** The rules a policy row must satisfy, applied identically on create and on
 * edit so an edit can't produce a row a create would have rejected. */
function validateInsurancePolicy(entry: {
  premiumAmountMinor?: number;
  sumAssuredMinor?: number | null;
  startDate?: string;
  renewalDate?: string | null;
}): void {
  if (entry.premiumAmountMinor !== undefined) {
    if (!Number.isInteger(entry.premiumAmountMinor) || entry.premiumAmountMinor <= 0) {
      throw new DomainError("A premium must be a whole number of minor units above zero.");
    }
  }
  if (entry.sumAssuredMinor != null) {
    if (!Number.isInteger(entry.sumAssuredMinor) || entry.sumAssuredMinor <= 0) {
      throw new DomainError("A sum assured must be a whole number of minor units above zero.");
    }
  }
  // A renewal before the policy started would make the "lapsed — renewal date
  // passed with no premium logged" insight fire on day one.
  if (entry.startDate && entry.renewalDate && entry.renewalDate < entry.startDate) {
    throw new DomainError("A policy's renewal date can't be before it started.");
  }
}

export function createInsurancePolicy(entry: NewInsurancePolicy) {
  validateInsurancePolicy(entry);
  return insertInsurancePolicy(entry);
}

export function getInsurancePolicies(scope: LifecycleScope = {}) {
  return listInsurancePolicies(scope);
}

export function getInsurancePolicy(id: number) {
  return getInsurancePolicyById(id) ?? null;
}

export type PremiumFrequency = "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";

/**
 * Billing periods per year. Weekly is 52, not 365÷7 — a weekly premium is
 * billed 52 times, and the extra day-and-a-bit is not a 53rd charge.
 */
const PERIODS_PER_YEAR: Record<PremiumFrequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
};

const MONTHS_PER_YEAR = BigInt(12);

export interface PremiumInput {
  premiumAmountMinor: number;
  premiumFrequency: PremiumFrequency;
  currency: Currency;
}

/** What the policy costs over a year, in its own currency's minor units. */
export function annualPremiumMinor(policy: PremiumInput): number {
  return toSafeNumber(
    BigInt(policy.premiumAmountMinor) * BigInt(PERIODS_PER_YEAR[policy.premiumFrequency]),
    "annualPremiumMinor",
  );
}

/**
 * The monthly-equivalent premium, for comparing policies billed on different
 * cycles side by side.
 *
 * The division is integer and rounds half away from zero: `annual / 12` on a
 * float reintroduces exactly the fractional-paisa drift that minor units
 * exist to remove, and twelve such figures would not sum back to the annual
 * one. This figure is a comparison aid — it is never posted as a transaction,
 * so the rounding residue has nowhere to accumulate.
 */
export function monthlyPremiumMinor(policy: PremiumInput): number {
  return toSafeNumber(
    divRound(BigInt(annualPremiumMinor(policy)), MONTHS_PER_YEAR),
    "monthlyPremiumMinor",
  );
}

/* ── Edit in place, archive, delete (decision 17) ────────────────────────────
 * A policy is a descriptive row: a re-rated premium or a corrected policy
 * number is an edit, and a policy that ends is archived, not deleted. */

/**
 * Edits a policy in place, re-running the create-time validation on the merged
 * row.
 *
 * The premium **currency** is refused once premiums have been logged, for the
 * same reason an account's is: nothing stored changes, but every amount on the
 * policy — and the 80C/80D totals computed from them — would silently be read
 * in a different denomination.
 */
export function editInsurancePolicy(
  id: number,
  patch: Partial<Omit<NewInsurancePolicy, "id" | "createdAt">>,
) {
  const existing = getInsurancePolicyById(id);
  if (!existing) throw new DomainError("That insurance policy no longer exists.");

  validateInsurancePolicy({
    premiumAmountMinor: patch.premiumAmountMinor ?? existing.premiumAmountMinor,
    sumAssuredMinor:
      patch.sumAssuredMinor === undefined ? existing.sumAssuredMinor : patch.sumAssuredMinor,
    startDate: patch.startDate ?? existing.startDate,
    renewalDate: patch.renewalDate === undefined ? existing.renewalDate : patch.renewalDate,
  });

  if (
    patch.currency !== undefined &&
    patch.currency !== existing.currency &&
    insurancePolicyHasPremiumHistory(id)
  ) {
    throw new DomainError(
      "Premiums have already been logged against this policy, so its currency can't be " +
        "changed. Archive it and record the policy again in the other currency instead.",
    );
  }

  return updateInsurancePolicy(id, patch);
}

/** Retires a policy (lapsed, surrendered, matured) without touching a premium
 * already paid: the policy drops out of listings and pickers while every
 * transaction tagged to its premium rule keeps counting toward 80C/80D. */
export function archiveInsurancePolicyById(id: number) {
  if (!getInsurancePolicyById(id)) throw new DomainError("That insurance policy no longer exists.");
  return archiveInsurancePolicy(id, todayIso());
}

export function unarchiveInsurancePolicyById(id: number) {
  if (!getInsurancePolicyById(id)) throw new DomainError("That insurance policy no longer exists.");
  return archiveInsurancePolicy(id, null);
}

/**
 * Hard-deletes a policy, and **refuses** once a premium has been logged under
 * it. The policy is the only record of what those payments were for, including
 * their tax treatment, so deleting it would orphan the deduction rather than
 * remove it.
 */
export function deleteInsurancePolicyById(id: number) {
  if (!getInsurancePolicyById(id)) throw new DomainError("That insurance policy no longer exists.");
  if (insurancePolicyHasPremiumHistory(id)) {
    throw new DomainError(
      "Premiums have already been logged against this policy, so it can't be deleted. Archive " +
        "it instead — it will be hidden from listings and the premium history stays intact.",
    );
  }
  deleteInsurancePolicy(id);
}
