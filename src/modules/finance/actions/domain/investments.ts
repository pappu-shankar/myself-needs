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
import {
  createHolding,
  createValuation,
  recordCashFlow,
  refreshMutualFundNav,
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

/** Amount and units are entered as positive numbers; the service derives signs from the flow type. */
export const addCashFlowAction = defineFormAction(
  z.object({
    holdingId: zId,
    date: zIsoDate,
    amount: zPositiveAmount,
    flowType: z.enum(CASH_FLOW_TYPES, { error: "Pick a flow type" }),
    units: zPositiveNumber.optional(),
  }),
  (input) => {
    // The holding's own currency sets the exponent; the service refuses a flow
    // in any other currency, so there is nothing to choose here.
    const currency = getHoldingCurrency(input.holdingId);
    recordCashFlow({
      holdingId: input.holdingId,
      date: input.date,
      flowType: input.flowType,
      amountMinor: toMinor(input.amount, currency),
      unitsScaled: input.units === undefined ? undefined : toUnitsScaled(input.units),
    });
  },
  { name: "finance:add-investment-cash-flow" },
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
