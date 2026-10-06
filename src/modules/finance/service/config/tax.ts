import { getDb } from "@/modules/core/db/client";
import { DomainError } from "@/modules/core/errors";
import {
  findTaxSettings,
  insertTaxSettings,
  listTaxSettingsFiscalYears,
  updateTaxSettings,
} from "../../db/queries/config/tax-settings";
import {
  deleteTaxSlab,
  findTaxSlab,
  insertTaxSlab,
  listTaxSlabFiscalYears,
  listTaxSlabs,
  updateTaxSlab,
  type TaxRegime,
} from "../../db/queries/config/tax-slabs";
import { parseFiscalYearLabel } from "../utility/fiscal-year";
import { formatMoney } from "@/lib/format";
import type { Currency } from "../../db/schema/currency";
import { STATUTORY_TAX_CURRENCY } from "../../types";

export type { TaxRegime };

/**
 * Every figure in `finance_tax_settings` and `finance_tax_slabs` is denominated
 * in this currency, whatever the user's base currency is: they are set by the
 * Indian Finance Act, so a ₹1.5 L 80C ceiling does not become something else
 * because someone switched their reports to USD (decision 15). Income and
 * contributions in another currency are converted *into* INR before they meet
 * one of these figures — never the other way round.
 */
/** Re-exported from `types.ts`, which client components can import safely. */
export const STATUTORY_CURRENCY: Currency = STATUTORY_TAX_CURRENCY;

const REGIMES: TaxRegime[] = ["old", "new"];

/**
 * Tax settings and slabs are stored per Indian FY. A calculation for an FY
 * without its own rows uses the closest earlier FY that has them (tax rules
 * roll forward until a budget changes them), or the earliest FY on record if
 * the requested FY predates everything. Returns undefined only if nothing
 * exists at all.
 */
export function resolvePolicyYear(requested: string, available: string[]): string | undefined {
  const sorted = [...available].sort();
  let resolved: string | undefined;
  for (const fy of sorted) {
    if (fy <= requested) resolved = fy;
  }
  return resolved ?? sorted[0];
}

/** Every FY with its own tax settings or slabs, ascending. */
export function listTaxPolicyYears(): string[] {
  const years = new Set([
    ...listTaxSettingsFiscalYears(),
    ...REGIMES.flatMap((r) => listTaxSlabFiscalYears(r)),
  ]);
  return [...years].sort();
}

/** The settings that apply to `fiscalYear` — `fiscalYear` on the result says which FY's row it actually is. */
export function getTaxSettingsForYear(fiscalYear: string) {
  const own = findTaxSettings(fiscalYear);
  if (own) return own;
  const resolved = resolvePolicyYear(fiscalYear, listTaxSettingsFiscalYears());
  // listTaxSettingsFiscalYears seeds on an empty table, so there is always one.
  return findTaxSettings(resolved!)!;
}

/** The slabs that apply to `fiscalYear` for a regime (possibly inherited from an earlier FY). */
export function getTaxSlabsForYear(fiscalYear: string, regime: TaxRegime) {
  const resolved = resolvePolicyYear(fiscalYear, listTaxSlabFiscalYears(regime));
  return resolved ? listTaxSlabs(resolved, regime) : [];
}

/** Settings-page view of one FY: whether it has its own rows, and what currently applies to it. */
export function getTaxPolicyView(fiscalYear: string) {
  const settings = getTaxSettingsForYear(fiscalYear);
  return {
    fiscalYear,
    hasOwnSettings: settings.fiscalYear === fiscalYear,
    settings,
    oldSlabs: getTaxSlabsForYear(fiscalYear, "old"),
    newSlabs: getTaxSlabsForYear(fiscalYear, "new"),
  };
}

function requireStartedYear(fiscalYear: string) {
  if (!findTaxSettings(fiscalYear)) {
    throw new DomainError(`FY ${fiscalYear} hasn't been started yet — start it first.`);
  }
}

type TaxSettingsPatch = Parameters<typeof updateTaxSettings>[1];

export function setTaxSettings(fiscalYear: string, patch: TaxSettingsPatch) {
  requireStartedYear(fiscalYear);
  return updateTaxSettings(fiscalYear, patch)!;
}

/**
 * Creates `fiscalYear` by copying the most recent FY's settings and slabs, so
 * the user edits what changed in that year's budget — no tax numbers are
 * invented for a year we can't know.
 */
export function startFiscalYear(fiscalYear: string) {
  if (!parseFiscalYearLabel(fiscalYear)) {
    throw new DomainError(`"${fiscalYear}" isn't a financial year like 2025-26.`);
  }
  if (findTaxSettings(fiscalYear)) {
    throw new DomainError(`FY ${fiscalYear} already exists.`);
  }
  const source = listTaxPolicyYears().at(-1)!;
  return getDb().transaction(() => {
    const sourceSettings = getTaxSettingsForYear(source);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, updatedAt, fiscalYear: _from, ...values } = sourceSettings;
    const created = insertTaxSettings({ ...values, fiscalYear });
    for (const regime of REGIMES) {
      if (listTaxSlabs(fiscalYear, regime).length > 0) continue; // keep any slabs already there
      for (const slab of getTaxSlabsForYear(source, regime)) {
        insertTaxSlab({
          fiscalYear,
          regime,
          uptoAmountMinor: slab.uptoAmountMinor,
          rateBps: slab.rateBps,
        });
      }
    }
    return created;
  });
}

interface SlabInput {
  /** Statutory INR paise — the bracket's inclusive upper bound. Null for the top bracket. */
  uptoAmountMinor: number | null;
  /** Integer basis points: 5% is 500. */
  rateBps: number;
}

/**
 * One FY+regime's brackets must describe a single progressive schedule:
 * capped brackets with strictly ascending positive upper limits, exactly one
 * open-ended top bracket, and every rate within 0–100%.
 *
 * Both figures must be integers: a fractional paise limit or a fractional
 * basis point would reintroduce the float arithmetic the minor-unit model
 * exists to keep off money.
 */
export function validateSlabSchedule(fiscalYear: string, regime: TaxRegime, slabs: SlabInput[]) {
  const where = `FY ${fiscalYear} ${regime} regime`;
  if (slabs.length === 0) {
    throw new DomainError(`The ${where} needs at least one bracket.`);
  }
  for (const slab of slabs) {
    if (!Number.isInteger(slab.rateBps) || slab.rateBps < 0 || slab.rateBps > 10_000) {
      throw new DomainError(`Slab rates must be between 0 and 100% (${where}).`);
    }
    if (
      slab.uptoAmountMinor !== null &&
      !(Number.isInteger(slab.uptoAmountMinor) && slab.uptoAmountMinor > 0)
    ) {
      throw new DomainError(`A bracket's upper limit must be more than zero (${where}).`);
    }
  }
  const openEnded = slabs.filter((s) => s.uptoAmountMinor === null).length;
  if (openEnded !== 1) {
    throw new DomainError(
      openEnded === 0
        ? `The ${where} needs one open-ended top bracket (leave its upper limit blank).`
        : `The ${where} can only have one open-ended top bracket.`,
    );
  }
  const caps = slabs
    .map((s) => s.uptoAmountMinor)
    .filter((u): u is number => u !== null)
    .sort((a, b) => a - b);
  for (let i = 1; i < caps.length; i++) {
    if (caps[i] === caps[i - 1]) {
      throw new DomainError(
        `Two brackets in the ${where} end at ${formatMoney(
          { minor: caps[i], currency: STATUTORY_CURRENCY },
          { wholeUnits: true },
        )} — upper limits must be strictly ascending.`,
      );
    }
  }
}

function ownSlabs(fiscalYear: string, regime: TaxRegime) {
  return listTaxSlabs(fiscalYear, regime).map((s) => ({
    id: s.id,
    uptoAmountMinor: s.uptoAmountMinor,
    rateBps: s.rateBps,
  }));
}

export function addTaxSlab(
  fiscalYear: string,
  regime: TaxRegime,
  uptoAmountMinor: number | null,
  rateBps: number,
) {
  requireStartedYear(fiscalYear);
  validateSlabSchedule(fiscalYear, regime, [
    ...ownSlabs(fiscalYear, regime),
    { uptoAmountMinor, rateBps },
  ]);
  return insertTaxSlab({ fiscalYear, regime, uptoAmountMinor, rateBps });
}

function requireSlab(id: number) {
  const slab = findTaxSlab(id);
  if (!slab) throw new DomainError("That slab no longer exists.");
  return slab;
}

export function editTaxSlab(id: number, uptoAmountMinor: number | null, rateBps: number) {
  const slab = requireSlab(id);
  validateSlabSchedule(
    slab.fiscalYear,
    slab.regime,
    ownSlabs(slab.fiscalYear, slab.regime).map((s) =>
      s.id === id ? { id, uptoAmountMinor, rateBps } : s,
    ),
  );
  return updateTaxSlab(id, { uptoAmountMinor, rateBps });
}

export function removeTaxSlab(id: number) {
  const slab = requireSlab(id);
  validateSlabSchedule(
    slab.fiscalYear,
    slab.regime,
    ownSlabs(slab.fiscalYear, slab.regime).filter((s) => s.id !== id),
  );
  deleteTaxSlab(id);
}
