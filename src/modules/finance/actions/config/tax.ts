"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { zId, zNumber, zPercent } from "@/lib/validation";
import { toMinor } from "@/lib/format";
import { toRateBps } from "../../service/utility/units";
import { STATUTORY_CURRENCY } from "../../service/config/tax";
import {
  addTaxSlab,
  editTaxSlab,
  removeTaxSlab,
  setTaxSettings,
  startFiscalYear,
} from "../../service/config/tax";

const zFiscalYear = z
  .string({ error: "Pick a financial year" })
  .regex(/^\d{4}-\d{2}$/, "Pick a financial year like 2025-26");
const zRegime = z.enum(["old", "new"], { error: "Pick a regime" });
/**
 * The form collects statutory figures the way the Finance Act states them and
 * the way anyone checking them would type them: rupees and percentages. They
 * are converted here, at the boundary — to INR paise and integer basis points.
 *
 * Statutory, so **INR**, never the vault's base currency (decision 15): an 80C
 * limit does not move when someone switches their display currency.
 */
const zRupees = zNumber.refine((n) => n >= 0, "Can't be negative");
const zMonths = zNumber.refine((n) => Number.isInteger(n) && n >= 0, "Enter whole months");
/** Blank = no upper limit (the open-ended top bracket). */
const zUpto = zNumber
  .refine((n) => n > 0, "Upper limit must be more than zero")
  .optional()
  .transform((n) => n ?? null);

const inr = (rupees: number) => toMinor(rupees, STATUTORY_CURRENCY);

export const updateTaxSettingsAction = defineFormAction(
  z.object({
    fiscalYear: zFiscalYear,
    eightyCLimit: zRupees,
    eightyDLimit: zRupees,
    equityLtcgThresholdMonths: zMonths,
    equityLtcgExemption: zRupees,
    equityLtcgRate: zPercent,
    equityStcgRate: zPercent,
    otherLtcgThresholdMonths: zMonths,
    otherLtcgRate: zPercent,
    otherStcgRate: zPercent,
    standardDeductionOld: zRupees,
    standardDeductionNew: zRupees,
    cessPercent: zPercent,
    rebate87aThresholdOld: zRupees,
    rebate87aThresholdNew: zRupees,
  }),
  ({ fiscalYear, ...input }) => {
    // Named explicitly rather than spread. A spread into the service's
    // `Partial<...>` patch type type-checks even with the wrong key names —
    // excess-property checking does not reach it — so every rupee field would
    // have been silently dropped and the save would appear to succeed.
    setTaxSettings(fiscalYear, {
      eightyCLimitMinor: inr(input.eightyCLimit),
      eightyDLimitMinor: inr(input.eightyDLimit),
      equityLtcgThresholdMonths: input.equityLtcgThresholdMonths,
      equityLtcgExemptionMinor: inr(input.equityLtcgExemption),
      equityLtcgRateBps: toRateBps(input.equityLtcgRate),
      equityStcgRateBps: toRateBps(input.equityStcgRate),
      otherLtcgThresholdMonths: input.otherLtcgThresholdMonths,
      otherLtcgRateBps: toRateBps(input.otherLtcgRate),
      otherStcgRateBps: toRateBps(input.otherStcgRate),
      standardDeductionOldMinor: inr(input.standardDeductionOld),
      standardDeductionNewMinor: inr(input.standardDeductionNew),
      cessBps: toRateBps(input.cessPercent),
      rebate87aThresholdOldMinor: inr(input.rebate87aThresholdOld),
      rebate87aThresholdNewMinor: inr(input.rebate87aThresholdNew),
    });
  },
  { name: "finance:tax-settings" },
);

/** Creates an FY by copying the most recent FY's settings and slabs. */
export const startFiscalYearAction = defineFormAction(
  z.object({ fiscalYear: zFiscalYear }),
  ({ fiscalYear }) => {
    startFiscalYear(fiscalYear);
    return { fiscalYear };
  },
  { name: "finance:tax-start-fy" },
);

export const addTaxSlabAction = defineFormAction(
  z.object({
    fiscalYear: zFiscalYear,
    regime: zRegime,
    uptoAmount: zUpto,
    ratePercent: zPercent,
  }),
  ({ fiscalYear, regime, uptoAmount, ratePercent }) => {
    // Both of these are positional `number` parameters, so passing rupees and a
    // percentage would have type-checked while being wrong by a factor of 100.
    addTaxSlab(
      fiscalYear,
      regime,
      uptoAmount === null ? null : inr(uptoAmount),
      toRateBps(ratePercent),
    );
  },
  { name: "finance:tax-slab-add" },
);

export const updateTaxSlabAction = defineFormAction(
  z.object({ id: zId, uptoAmount: zUpto, ratePercent: zPercent }),
  ({ id, uptoAmount, ratePercent }) => {
    editTaxSlab(id, uptoAmount === null ? null : inr(uptoAmount), toRateBps(ratePercent));
  },
  { name: "finance:tax-slab-update" },
);

export const deleteTaxSlabAction = defineFormAction(
  z.object({ id: zId }),
  ({ id }) => {
    removeTaxSlab(id);
  },
  { name: "finance:tax-slab-delete" },
);
