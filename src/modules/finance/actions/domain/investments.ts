"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import {
  zCheckbox,
  zId,
  zIsoDate,
  zOptionalText,
  zPercent,
  zPositiveAmount,
  zPositiveNumber,
  zText,
} from "@/lib/validation";
import type { CashFlowInputFromUser } from "../../service/domain/investments";
import {
  correctCashFlow,
  createHolding,
  createValuation,
  recordCashFlow,
  refreshMutualFundNav,
  voidCashFlow,
} from "../../service/domain/investments";
import { INVESTMENT_TYPES, CASH_FLOW_TYPES, ACCRUAL_TYPES } from "../../types";
import { toMinor } from "@/lib/format";
import { toPriceScaled, toRateBps, toUnitsScaled } from "../../service/utility/units";
import { getHoldingCurrency } from "../../service/domain/investments";
import { CURRENCIES } from "../../db/schema/currency";
import { getBaseCurrency } from "../../db/queries/config/settings";

export type AddHoldingState = ActionState;
export type AddCashFlowState = ActionState;
export type AddValuationState = ActionState;
export type VoidCashFlowState = ActionState;
export type CorrectCashFlowState = ActionState;
export type RefreshNavState = ActionState;

const holdingSchema = z
  .object({
    type: z.enum(INVESTMENT_TYPES, { error: "Pick a holding type" }),
    name: zText("Name"),
    accountId: zId.optional(),
    interestRate: zPercent.optional(),
    maturityDate: zIsoDate.optional(),
    schemeTemplateId: zId.optional(),
    externalCode: z
      .string()
      .trim()
      .regex(/^\d{1,10}$/, "AMFI scheme codes are numbers, e.g. 119551")
      .optional(),
    notes: zOptionalText(),
    currency: z.enum(CURRENCIES).optional(),
    is80cEligible: zCheckbox,
    linkedGoalId: zId.optional(),
  })
  .refine((h) => !ACCRUAL_TYPES.has(h.type) || h.interestRate !== undefined, {
    message: "Enter the interest rate",
    path: ["interestRate"],
  });

/**
 * Units are no longer set on the holding itself: they come from the units on
 * each buy/sell cash flow (see `recordCashFlow`). The holding's `units` column
 * is only read as an opening balance for older holdings.
 */
export const addHoldingAction = defineFormAction(
  holdingSchema,
  (input) => {
    const isAccrual = ACCRUAL_TYPES.has(input.type);
    // No currency field on the holding form yet, so a new holding is
    // denominated in what the vault reports in. An international holding whose
    // prices are quoted elsewhere is corrected from the reconciliation queue —
    // the same path migration 0028 queues pre-existing ones through.
    const currency = input.currency ?? getBaseCurrency();
    createHolding({
      type: input.type,
      name: input.name,
      accountId: input.accountId ?? null,
      currency,
      unitsScaled: null,
      // A rate that multiplies money is basis points, never a float.
      rateBps: isAccrual && input.interestRate !== undefined ? toRateBps(input.interestRate) : null,
      maturityDate: isAccrual ? (input.maturityDate ?? null) : null,
      schemeTemplateId: input.type === "govt_scheme" ? (input.schemeTemplateId ?? null) : null,
      externalCode: input.type === "mutual_fund_domestic" ? (input.externalCode ?? null) : null,
      notes: input.notes ?? null,
      is80cEligible: input.is80cEligible,
      linkedGoalId: input.linkedGoalId ?? null,
    });
  },
  { name: "finance:add-holding" },
);

const cashFlowFields = {
  holdingId: zId,
  date: zIsoDate,
  amount: zPositiveAmount,
  flowType: z.enum(CASH_FLOW_TYPES, { error: "Pick a flow type" }),
  units: zPositiveNumber.optional(),
};

/**
 * Form values to the service's user-level input. The holding's own currency
 * sets the exponent; the service refuses a flow in any other currency, so
 * there is nothing to choose here.
 */
function toCashFlowInput(input: {
  holdingId: number;
  date: string;
  amount: number;
  flowType: (typeof CASH_FLOW_TYPES)[number];
  units?: number;
}): CashFlowInputFromUser {
  const currency = getHoldingCurrency(input.holdingId);
  return {
    holdingId: input.holdingId,
    date: input.date,
    flowType: input.flowType,
    amountMinor: toMinor(input.amount, currency),
    unitsScaled: input.units === undefined ? undefined : toUnitsScaled(input.units),
  };
}

/** Amount and units are entered as positive numbers; the service derives signs from the flow type. */
export const addCashFlowAction = defineFormAction(
  z.object(cashFlowFields),
  (input) => {
    recordCashFlow(toCashFlowInput(input));
  },
  { name: "finance:add-investment-cash-flow" },
);

/**
 * Reverses a cash flow that should never have been recorded. The reason is
 * required: a reversed flow with no stated reason leaves a hole in a return
 * series that nobody can account for later.
 */
export const voidCashFlowAction = defineFormAction(
  z.object({ id: zId, reason: zText("A reason") }),
  (input) => {
    voidCashFlow(input.id, input.reason);
  },
  { name: "finance:void-investment-cash-flow" },
);

/**
 * Corrects a cash flow. The submitted values are the *replacement*; the
 * service voids the original and records this through the same `recordCashFlow`
 * path a fresh entry takes, so the sign, the currency and the units-held check
 * all still apply.
 */
export const correctCashFlowAction = defineFormAction(
  z.object({ ...cashFlowFields, id: zId, reason: zText("A reason") }),
  (input) => {
    correctCashFlow(input.id, toCashFlowInput(input), input.reason);
  },
  { name: "finance:correct-investment-cash-flow" },
);

export const addValuationAction = defineFormAction(
  z.object({
    holdingId: zId,
    date: zIsoDate,
    pricePerUnit: zPositiveNumber,
  }),
  (input) => {
    // Prices scale by PRICE_SCALE, independently of the currency's exponent —
    // a NAV is quoted to four decimals in a 2-decimal currency.
    createValuation({
      holdingId: input.holdingId,
      date: input.date,
      priceScaled: toPriceScaled(input.pricePerUnit),
      priceCurrency: getHoldingCurrency(input.holdingId),
      source: "user",
      method: "manual",
      confidence: "reported",
      asOf: input.date,
    });
  },
  { name: "finance:add-valuation" },
);

export const refreshNavAction = defineFormAction(
  z.object({ holdingId: zId }),
  async ({ holdingId }) => {
    await refreshMutualFundNav(holdingId);
  },
  { name: "finance:refresh-nav" },
);
