import { DomainError } from "@/modules/core/errors";
import { todayIso, daysBetween } from "@/lib/dates";
import {
  archiveGoal,
  deleteGoal,
  getGoalById,
  goalHasReferences,
  insertGoal,
  listGoals,
  listRecurringRulesForGoal,
  updateGoal,
  type NewGoal,
} from "../../db/queries/domain/goals";
import { listHoldingsByGoalId } from "../../db/queries/domain/investments";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { getHoldingValue } from "./investments";
import { aggregateToBase, weakestConfidence, type MoneyAggregate } from "../utility/aggregate";
import { divRound, toSafeNumber } from "../utility/integer-math";
import type { Currency } from "../../db/schema/currency";
import type { ConfidenceLevel } from "../../db/schema/provenance";
import { GOAL_PRIORITIES } from "../../db/schema/domain/goals";

/**
 * Financial goals: progress, required funding, and who gets funded when there
 * is not enough to go round.
 *
 * Everything here is measured in the **goal's own currency**, not the vault's
 * base currency. A goal is a commitment to buy something priced in a particular
 * currency — a house in rupees, tuition in dollars — so converting the target
 * into a reporting currency and back would add a rate to a number the user
 * stated exactly. Linked holdings priced elsewhere convert *into* the goal's
 * currency, and the rate used travels with the figure.
 *
 * See docs/prd/finance/goals.md.
 */

export function createGoal(entry: NewGoal) {
  if (!Number.isInteger(entry.targetAmountMinor) || entry.targetAmountMinor <= 0) {
    throw new DomainError("A goal needs a target amount greater than zero.");
  }
  if (
    entry.targetDate !== undefined &&
    entry.targetDate !== null &&
    entry.targetDate < todayIso()
  ) {
    throw new DomainError("A goal's target date can't be in the past.");
  }
  return insertGoal(entry);
}

export function getGoals() {
  return listGoals();
}

export function getGoal(id: number) {
  return getGoalById(id) ?? null;
}

export function editGoal(id: number, patch: Partial<Omit<NewGoal, "id">>) {
  if (!getGoalById(id)) throw new DomainError("Goal not found.");
  if (
    patch.targetAmountMinor !== undefined &&
    (!Number.isInteger(patch.targetAmountMinor) || patch.targetAmountMinor <= 0)
  ) {
    throw new DomainError("A goal needs a target amount greater than zero.");
  }
  return updateGoal(id, patch);
}

/**
 * Archive rather than delete whenever anything still references the goal.
 *
 * A holding or a recurring rule points at it by foreign key, and the history of
 * what a contribution was *for* is the part worth keeping — deleting the goal
 * would either break the reference or silently detach the record of intent.
 */
export function retireGoal(id: number) {
  if (!getGoalById(id)) throw new DomainError("Goal not found.");
  if (goalHasReferences(id)) return archiveGoal(id, todayIso());
  deleteGoal(id);
  return null;
}

export interface GoalProgress {
  goalId: number;
  name: string;
  currency: Currency;
  targetMinor: number;
  /** Value of linked holdings, converted into the goal's currency. */
  fundedMinor: number;
  /** The conversion behind `fundedMinor`, so the figure states its own basis. */
  funded: MoneyAggregate;
  /** Target minus funded, floored at zero. */
  shortfallMinor: number;
  /** 0–1, null when the funded figure is incomplete: a fraction of a total
   * that is missing a currency is not a fraction. */
  fundedFraction: number | null;
  targetDate: string | null;
  priority: (typeof GOAL_PRIORITIES)[number];
  /** Months until the target date, floored at zero. Null with no date. */
  monthsRemaining: number | null;
  /**
   * What must be contributed each month to close the gap by the target date,
   * ignoring growth — a deliberately conservative figure, since the expected
   * return is an assumption and the contribution is a commitment. Null when
   * there is no date, or the date has passed.
   */
  requiredMonthlyMinor: number | null;
  /** What linked recurring rules actually contribute each month. */
  contributedMonthlyMinor: number;
  confidence: ConfidenceLevel;
  complete: boolean;
}

/** A rule's amount expressed per month, so schedules of different frequencies
 * are comparable. Integer division throughout — a quarterly ₹30,000.01 must not
 * become a float. */
const MONTHS_PER_PERIOD: Record<string, number> = {
  weekly: 1,
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

function monthlyEquivalentMinor(amountMinor: number, frequency: string): number {
  // Weekly is the one frequency that is not a whole number of months. 52 weeks
  // over 12 months is the honest conversion; 4 weeks a month would understate
  // the year by a month's worth.
  if (frequency === "weekly") {
    return toSafeNumber(
      divRound(BigInt(amountMinor) * BigInt(52), BigInt(12)),
      "monthlyEquivalent",
    );
  }
  const months = MONTHS_PER_PERIOD[frequency] ?? 1;
  return toSafeNumber(divRound(BigInt(amountMinor), BigInt(months)), "monthlyEquivalent");
}

/** Whole months between two dates, floored at zero. Months rather than days
 * because a contribution schedule is monthly, and a part-month cannot receive
 * a contribution. */
function monthsBetween(from: string, to: string): number {
  return Math.max(0, Math.floor(daysBetween(from, to) / 30));
}

export function getGoalProgress(goalId: number): GoalProgress {
  const goal = getGoalById(goalId);
  if (!goal) throw new DomainError("Goal not found.");
  const today = todayIso();
  const rates = listFxRatesAsOf(today);

  // Linked holdings, each valued in whatever its own price is quoted in, then
  // converted into the goal's currency — not into base. The goal is the frame
  // of reference here.
  const byCurrency = new Map<Currency, number>();
  const levels: ConfidenceLevel[] = [];
  for (const holding of listHoldingsByGoalId(goalId)) {
    const value = getHoldingValue(holding);
    byCurrency.set(value.currency, (byCurrency.get(value.currency) ?? 0) + value.currentValueMinor);
    levels.push(value.confidence);
  }
  const funded = aggregateToBase(byCurrency, {
    baseCurrency: goal.currency,
    asOf: today,
    rates,
  });

  const monthsRemaining = goal.targetDate === null ? null : monthsBetween(today, goal.targetDate);
  const shortfallMinor = Math.max(0, goal.targetAmountMinor - funded.baseMinor);
  const requiredMonthlyMinor =
    monthsRemaining === null || monthsRemaining === 0
      ? null
      : toSafeNumber(divRound(BigInt(shortfallMinor), BigInt(monthsRemaining)), "requiredMonthly");

  let contributedMonthlyMinor = 0;
  for (const rule of listRecurringRulesForGoal(goalId)) {
    // Only rules already denominated in the goal's currency count directly; a
    // rule in another currency would need a rate per future period, which is a
    // forecast, not a fact.
    if (rule.currency !== goal.currency) continue;
    contributedMonthlyMinor += monthlyEquivalentMinor(rule.amountMinor, rule.frequency);
  }

  return {
    goalId,
    name: goal.name,
    currency: goal.currency,
    targetMinor: goal.targetAmountMinor,
    fundedMinor: funded.baseMinor,
    funded,
    shortfallMinor,
    fundedFraction: funded.complete ? funded.baseMinor / goal.targetAmountMinor : null,
    targetDate: goal.targetDate,
    priority: goal.priority,
    monthsRemaining,
    requiredMonthlyMinor,
    contributedMonthlyMinor,
    confidence: weakestConfidence(levels),
    complete: funded.complete,
  };
}

export interface FundingPlanRow extends GoalProgress {
  /** What this goal receives out of the available surplus under the stated
   * order, in the goal's currency's minor units. */
  allocatedMonthlyMinor: number;
  status: "funded" | "partly_funded" | "unfunded";
}

export interface FundingPlan {
  rows: FundingPlanRow[];
  /** What was left after the waterfall — the surplus the user can still direct. */
  unallocatedMonthlyMinor: number;
  surplusCurrency: Currency;
  /** True when a goal was skipped because its currency differs from the
   * surplus's and no rate resolved, so the plan is not the whole picture. */
  complete: boolean;
}

/**
 * Who gets funded when the surplus will not cover everything.
 *
 * Fills goals in priority order — essential, then important, then lifestyle,
 * earliest date first within a tier — and reports what each one got. The module
 * never reorders silently; the order is the one `listGoals` returns and the
 * user can override it by changing a goal's priority.
 *
 * `surplusMonthlyMinor` is supplied by the caller rather than computed here:
 * what counts as spendable surplus is a cash-flow question, and a goal plan
 * that quietly picked its own definition of it would be unauditable.
 */
export function getFundingPlan(
  surplusMonthlyMinor: number,
  surplusCurrency: Currency,
): FundingPlan {
  const today = todayIso();
  const rates = listFxRatesAsOf(today);
  let remaining = surplusMonthlyMinor;
  let complete = true;
  const rows: FundingPlanRow[] = [];

  for (const goal of listGoals()) {
    const progress = getGoalProgress(goal.id);
    const required = progress.requiredMonthlyMinor;
    if (required === null || required === 0) {
      rows.push({ ...progress, allocatedMonthlyMinor: 0, status: "funded" });
      continue;
    }

    // The surplus and the goal may be in different currencies. Convert the
    // requirement into the surplus's currency to decide how much of the
    // surplus it consumes — and if no rate resolves, fund nothing rather than
    // guessing, and say the plan is incomplete.
    let requiredInSurplus = required;
    if (goal.currency !== surplusCurrency) {
      const converted = aggregateToBase(new Map([[goal.currency, required]]), {
        baseCurrency: surplusCurrency,
        asOf: today,
        rates,
      });
      if (!converted.complete) {
        complete = false;
        rows.push({ ...progress, allocatedMonthlyMinor: 0, status: "unfunded" });
        continue;
      }
      requiredInSurplus = converted.baseMinor;
    }

    const takenInSurplus = Math.max(0, Math.min(remaining, requiredInSurplus));
    remaining -= takenInSurplus;
    // Report the allocation in the goal's own currency, scaled by the same
    // ratio — so the row's numbers are all in one unit.
    const allocatedMonthlyMinor =
      requiredInSurplus === 0
        ? 0
        : toSafeNumber(
            divRound(BigInt(required) * BigInt(takenInSurplus), BigInt(requiredInSurplus)),
            "fundingAllocation",
          );

    rows.push({
      ...progress,
      allocatedMonthlyMinor,
      status:
        allocatedMonthlyMinor >= required
          ? "funded"
          : allocatedMonthlyMinor > 0
            ? "partly_funded"
            : "unfunded",
    });
  }

  return { rows, unallocatedMonthlyMinor: remaining, surplusCurrency, complete };
}
