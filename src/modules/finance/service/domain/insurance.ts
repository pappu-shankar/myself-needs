import {
  insertInsurancePolicy,
  listInsurancePolicies,
  type NewInsurancePolicy,
} from "../../db/queries/domain/insurance";
import { divRound, toSafeNumber } from "../utility/integer-math";
import type { Currency } from "../../db/schema/currency";

export function createInsurancePolicy(entry: NewInsurancePolicy) {
  return insertInsurancePolicy(entry);
}

export function getInsurancePolicies() {
  return listInsurancePolicies();
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
