import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { getAccounts } from "../accounts";
import { getHoldingsWithValue } from "../investments";
import { getBudgetsForMonth } from "../budgets";
import { getEmergencyFundMonths } from "../reports";
import { getInsurancePolicies } from "../insurance";
import { getDueWorklist } from "../recurring";
import {
  get80cUtilization,
  get80dUtilization,
  getCapitalGainsEstimate,
  getRegimeComparison,
} from "../tax";
import { getTaxSettingsForYear } from "../../config/tax";
import { currentFiscalYear } from "../../utility/fiscal-year";
import {
  findDuplicateTransactionGroups,
  countUncategorizedTransactions,
} from "../../../db/queries/domain/insights";
import { getInsightsSettings } from "../../../db/queries/config/insights-settings";
import { listFxRatesAsOf } from "../../../db/queries/config/fx-rates";
import { getBaseCurrency } from "../../../db/queries/config/settings";
import { loanTerms } from "../../../db/schema/domain/loan-terms";
import { creditTerms } from "../../../db/schema/domain/credit-terms";
import { accounts } from "../../../db/schema/domain/accounts";
import type { Currency } from "../../../db/schema/currency";
import { todayIso } from "@/lib/dates";

/**
 * Indian tax figures are statutory INR, not the user's base currency — see the
 * header of `db/schema/config/tax-settings.ts`. Carried on the snapshot so a
 * rule formatting a deduction limit never has to assume a currency, and so the
 * day a tax figure gains its own currency column there is one place to change.
 */
const STATUTORY_TAX_CURRENCY: Currency = "INR";

export interface DebtTerms {
  /** Annual rate in basis points — `loan_terms.rate_bps` for an amortizing
   * loan, `credit_terms.apr_bps` for a revolving facility. */
  rateBps: number | null;
  creditLimitMinor: number | null;
  /** The currency the limit is denominated in. It can differ from the
   * account's own currency, which is why utilization is only computed when the
   * two agree rather than converted at a rate nobody supplied. */
  limitCurrency: Currency | null;
}

/**
 * Rate and limit per debt account, keyed by account id.
 *
 * Migration 0028 moved `interest_rate` and `credit_limit` off
 * `finance_accounts` into `finance_loan_terms` / `finance_credit_terms`, so the
 * debt rules can no longer read them from the account row. Read here rather
 * than through `db/queries/` only because no query helper for the two terms
 * tables exists yet — see the note in the phase-9 report; this collapses to one
 * `listDebtTerms()` call once it does.
 */
function getDebtTerms(): Map<number, DebtTerms> {
  const db = getDb();
  const terms = new Map<number, DebtTerms>();

  const loans = db
    .select({
      accountId: loanTerms.accountId,
      rateBps: loanTerms.rateBps,
    })
    .from(loanTerms)
    .all();
  for (const row of loans) {
    terms.set(row.accountId, { rateBps: row.rateBps, creditLimitMinor: null, limitCurrency: null });
  }

  const credit = db
    .select({
      accountId: creditTerms.accountId,
      aprBps: creditTerms.aprBps,
      creditLimitMinor: creditTerms.creditLimitMinor,
      currency: creditTerms.currency,
    })
    .from(creditTerms)
    .innerJoin(accounts, eq(creditTerms.accountId, accounts.id))
    .all();
  for (const row of credit) {
    const existing = terms.get(row.accountId);
    terms.set(row.accountId, {
      rateBps: existing?.rateBps ?? row.aprBps,
      creditLimitMinor: row.creditLimitMinor,
      limitCurrency: row.creditLimitMinor === null ? null : row.currency,
    });
  }

  return terms;
}

/**
 * Everything every rule function needs, gathered once per engine run —
 * intra-module composition (all these live inside `finance`), not a
 * cross-module import. See docs/prd/finance/insights.md.
 */
export function getFinanceSnapshot() {
  // Every tax figure below is for the same FY, with that FY's settings.
  const fy = currentFiscalYear();
  const today = todayIso();
  return {
    today,
    accounts: getAccounts(),
    debtTerms: getDebtTerms(),
    holdings: getHoldingsWithValue(),
    budgets: getBudgetsForMonth(),
    emergencyFundMonths: getEmergencyFundMonths(),
    insurancePolicies: getInsurancePolicies(),
    dueWorklist: getDueWorklist(),
    eightyC: get80cUtilization(fy),
    eightyD: get80dUtilization(fy),
    regime: getRegimeComparison(fy),
    capitalGains: getCapitalGainsEstimate(fy),
    taxSettings: getTaxSettingsForYear(fy.label),
    taxCurrency: STATUTORY_TAX_CURRENCY,
    baseCurrency: getBaseCurrency(),
    /* Read once per run, as of today: a rule that needs to compare two
     * currencies resolves its own rate from these and reports nothing when the
     * rate is unknown. Never a fallback rate — see service/utility/fx.ts. */
    fxRates: listFxRatesAsOf(today),
    fy,
    duplicateGroups: findDuplicateTransactionGroups(),
    uncategorizedCount: countUncategorizedTransactions(),
    settings: getInsightsSettings(),
  };
}

export type FinanceSnapshot = ReturnType<typeof getFinanceSnapshot>;
