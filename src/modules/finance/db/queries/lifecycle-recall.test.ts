import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getDb } from "@/modules/core/db/client";
import { sql } from "drizzle-orm";
import {
  getAccountBalanceMinor,
  getAccountsTotalByCurrency,
  listAccountsWithBalances,
} from "./domain/accounts";
import {
  countTransactions,
  listTransactionsByCursor,
  listRecentTransactions,
} from "./domain/transactions";
import { listBudgetsForMonth } from "./domain/budgets";
import { getMonthlyIncomeExpense, getExpenseByCategory } from "./domain/reports";
import {
  get80cHoldingContributionsByCurrency,
  getInsurancePremiumsPaidByCurrency,
  listRedemptionDates,
} from "./domain/tax";
import { findDuplicateTransactionGroups, countUncategorizedTransactions } from "./domain/insights";
import { listAllCashFlows, listCashFlowsForHolding } from "./domain/investments";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

/**
 * The total-recall guard for void.
 *
 * Adding `voided_at` to the schema was the easy half; the hazard is the query
 * that forgets the filter. Asserting one specific void in one specific query
 * only proves the filter you remembered to write. So: seed a vault, void
 * *everything*, and require every money-bearing query to report zero. That
 * catches the filters nobody thought of.
 *
 * A query that legitimately shows voided rows — the correction trail — opts in
 * with `{ includeVoided: true }`, and the last test here proves that still works.
 */
function seedVault() {
  const db = getDb();
  db.run(sql`INSERT INTO finance_accounts (id, name, type, opening_balance_minor, currency, kind, normal_balance)
             VALUES (1, 'Savings', 'savings', 0, 'INR', 'asset', 'debit'),
                    (2, 'Brokerage', 'investment', 0, 'INR', 'asset', 'debit')`);
  db.run(
    sql`INSERT INTO finance_categories (id, name, type) VALUES (1, 'Rent', 'expense'), (2, 'Salary', 'income')`,
  );
  db.run(sql`INSERT INTO finance_recurring_rules (id, type, account_id, category_id, amount_minor, currency, frequency, start_date)
             VALUES (1, 'expense', 1, 1, 2500000, 'INR', 'monthly', '2026-01-01')`);
  db.run(sql`INSERT INTO finance_insurance_policies
               (id, type, provider, name, premium_amount_minor, premium_frequency, start_date, currency, is_80c_eligible, is_80d_eligible, recurring_rule_id)
             VALUES (1, 'term', 'LIC', 'Term', 1250000, 'yearly', '2020-01-01', 'INR', 1, 0, 1)`);
  // Two identical rows, so the duplicate-detection rule has something to find.
  db.run(sql`INSERT INTO finance_transactions (id, type, account_id, category_id, amount_minor, currency, date, recurring_rule_id)
             VALUES (1, 'expense', 1, 1, 2500000, 'INR', '2026-03-05', 1),
                    (2, 'expense', 1, 1, 2500000, 'INR', '2026-03-05', 1),
                    (3, 'income', 1, 2, 9000000, 'INR', '2026-03-01', NULL),
                    (4, 'expense', 1, NULL, 100000, 'INR', '2026-03-10', NULL),
                    (5, 'transfer', 1, NULL, 500000, 'INR', '2026-03-12', NULL)`);
  db.run(sql`UPDATE finance_transactions SET to_account_id = 2 WHERE id = 5`);
  db.run(sql`INSERT INTO finance_budgets (id, category_id, monthly_limit_minor, currency, effective_from)
             VALUES (1, 1, 3000000, 'INR', '2026-03-01')`);
  db.run(sql`INSERT INTO finance_investment_holdings (id, type, name, units_scaled, currency, liquidity, is_80c_eligible)
             VALUES (1, 'equity', 'INFY', 10000000, 'INR', 'liquid', 1)`);
  db.run(sql`INSERT INTO finance_investment_cash_flows (id, holding_id, date, amount_minor, currency, flow_type)
             VALUES (1, 1, '2026-01-01', -1500000, 'INR', 'contribution'),
                    (2, 1, '2026-02-01', 500000, 'INR', 'redemption')`);
}

function voidEverything() {
  const db = getDb();
  db.run(sql`UPDATE finance_transactions SET voided_at = '2026-03-20', void_reason = 'test'`);
  db.run(
    sql`UPDATE finance_investment_cash_flows SET voided_at = '2026-03-20', void_reason = 'test'`,
  );
}

describe("void is honoured by every money query", () => {
  it("reports real figures before anything is voided", () => {
    seedVault();

    // Baseline: the seed is not accidentally empty, which would make every
    // assertion below pass for the wrong reason.
    expect(getAccountBalanceMinor(1)).toBe(-2500000 - 2500000 + 9000000 - 100000 - 500000);
    expect(getAccountBalanceMinor(2)).toBe(500000);
    expect(countTransactions()).toBe(5);
    expect(listAllCashFlows()).toHaveLength(2);
    expect(findDuplicateTransactionGroups()).toHaveLength(1);
    expect(countUncategorizedTransactions()).toBe(1);
    expect(listRedemptionDates()).toEqual(["2026-02-01"]);
    expect(get80cHoldingContributionsByCurrency("2026-01-01", "2026-12-31").get("INR")).toBe(
      1500000,
    );
    expect(
      getInsurancePremiumsPaidByCurrency("is80cEligible", "2026-01-01", "2026-12-31").get("INR"),
    ).toBe(5000000);
    expect(getMonthlyIncomeExpense("2026-01-01", "2026-12-31")).not.toEqual([]);
    expect(getExpenseByCategory("2026-01-01", "2026-12-31")).not.toEqual([]);
    expect(listBudgetsForMonth("2026-03-01", "2026-04-01")[0].actualSpendMinor).toBe(5000000);
  });

  it("returns zero from every money query once every row is voided", () => {
    seedVault();
    voidEverything();

    // Balances fall back to the opening balance alone — both legs of the
    // UNION ALL in transactionDeltasByAccount must filter, or the destination
    // of the voided transfer keeps its 5,000.
    expect(getAccountBalanceMinor(1)).toBe(0);
    expect(getAccountBalanceMinor(2)).toBe(0);
    for (const account of listAccountsWithBalances()) {
      expect(account.balanceMinor, account.name).toBe(0);
    }
    expect([...getAccountsTotalByCurrency([1, 2]).values()]).toEqual([0]);

    expect(countTransactions()).toBe(0);
    expect(listTransactionsByCursor({}).rows).toEqual([]);
    expect(listRecentTransactions()).toEqual([]);

    expect(listBudgetsForMonth("2026-03-01", "2026-04-01")[0].actualSpendMinor).toBe(0);
    expect(getMonthlyIncomeExpense("2026-01-01", "2026-12-31")).toEqual([]);
    expect(getExpenseByCategory("2026-01-01", "2026-12-31")).toEqual([]);

    expect(get80cHoldingContributionsByCurrency("2026-01-01", "2026-12-31").size).toBe(0);
    expect(
      getInsurancePremiumsPaidByCurrency("is80cEligible", "2026-01-01", "2026-12-31").size,
    ).toBe(0);
    expect(listRedemptionDates()).toEqual([]);

    expect(findDuplicateTransactionGroups()).toEqual([]);
    expect(countUncategorizedTransactions()).toBe(0);

    expect(listAllCashFlows()).toEqual([]);
    expect(listCashFlowsForHolding(1)).toEqual([]);
  });

  it("leaves both sides of a voided transfer agreeing", () => {
    seedVault();
    const sourceBefore = getAccountBalanceMinor(1);
    const destinationBefore = getAccountBalanceMinor(2);

    getDb().run(sql`UPDATE finance_transactions SET voided_at = '2026-03-20' WHERE id = 5`);

    // The transfer was 5,000 out of account 1 and into account 2. Voiding it
    // has to move both by the same amount in opposite directions; filtering one
    // leg only would leave the money existing in account 2 and nowhere else.
    expect(getAccountBalanceMinor(1)).toBe(sourceBefore + 500000);
    expect(getAccountBalanceMinor(2)).toBe(destinationBefore - 500000);
    expect(getAccountBalanceMinor(2)).toBe(0);
  });

  it("still shows voided rows to the correction trail that asks for them", () => {
    seedVault();
    voidEverything();

    const trail = listTransactionsByCursor({ includeVoided: true });
    expect(trail.rows).toHaveLength(5);
    expect(trail.rows[0].voidedAt).toBe("2026-03-20");
    expect(trail.rows[0].voidReason).toBe("test");
    // And it did not change the numbers while doing so.
    expect(countTransactions()).toBe(0);
    expect(countTransactions({ includeVoided: true })).toBe(5);
  });
});
