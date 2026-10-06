import { eq, or, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { accounts } from "../../schema/domain/accounts";
import { transactions } from "../../schema/domain/transactions";
import { loanTerms } from "../../schema/domain/loan-terms";
import { creditTerms } from "../../schema/domain/credit-terms";
import { recurringRules } from "../../schema/domain/recurring-rules";
import { investmentHoldings } from "../../schema/domain/investment-holdings";
import type { Currency } from "../../schema/currency";
import { unarchived, type LifecycleScope } from "../lifecycle";

export type NewAccount = typeof accounts.$inferInsert;

/** Accounts still in use. Archived ones are retained — history references
 * them — but kept out of pickers and totals unless explicitly asked for. */
export function listAccounts(scope: LifecycleScope = {}) {
  const query = getDb().select().from(accounts);
  return (scope.includeArchived ? query : query.where(unarchived(accounts.archivedAt)))
    .orderBy(accounts.name)
    .all();
}

export function getAccountByIdRow(id: number) {
  return getDb().select().from(accounts).where(eq(accounts.id, id)).get();
}

export function insertAccount(entry: NewAccount) {
  return getDb().insert(accounts).values(entry).returning().get();
}

/**
 * Net effect (in minor units) of every transaction on each account, in one
 * grouped query: income adds, expense and outgoing transfer subtract (via
 * account_id), incoming transfer adds (via to_account_id). Summed as integers,
 * so balances are exact. `asOfDate` (YYYY-MM-DD) limits it to transactions
 * on/before that date. Never stored — see docs/architecture/data-model.md.
 *
 * No currency appears in the GROUP BY and none is needed: currency is pinned
 * at the account (decision 6), so every leg summed here is already in that
 * account's own currency. The incoming leg of a cross-currency transfer uses
 * `to_amount_minor`, which is denominated in the *destination* account's
 * currency — which is exactly the account the sum is grouped under.
 */
function transactionDeltasByAccount(asOfDate?: string): Map<number, number> {
  const dateFilter = asOfDate ? sql`WHERE date <= ${asOfDate}` : sql``;
  // The void filter appears in BOTH legs. Filtering only the first one makes a
  // voided transfer disappear from the source account and survive on the
  // destination, so the two sides of one reversal stop agreeing — see
  // queries/lifecycle.ts.
  const rows = getDb().all<{ accountId: number; deltaMinor: number }>(sql`
    SELECT account_id AS accountId, SUM(delta) AS deltaMinor FROM (
      SELECT ${transactions.accountId} AS account_id, ${transactions.date} AS date,
        CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountMinor} ELSE -${transactions.amountMinor} END AS delta
      FROM ${transactions}
      WHERE ${transactions.voidedAt} IS NULL
      UNION ALL
      SELECT ${transactions.toAccountId}, ${transactions.date},
        COALESCE(${transactions.toAmountMinor}, ${transactions.amountMinor})
      FROM ${transactions}
      WHERE ${transactions.type} = 'transfer' AND ${transactions.toAccountId} IS NOT NULL
        AND ${transactions.voidedAt} IS NULL
    ) ${dateFilter}
    GROUP BY account_id
  `);
  return new Map(rows.map((row) => [row.accountId, Number(row.deltaMinor)]));
}

/** Balance of one account in its own currency's minor units: opening balance
 * plus every transaction touching it. `asOfDate`, when given, gives the
 * point-in-time balance. */
export function getAccountBalanceMinor(accountId: number, asOfDate?: string): number {
  const account = getAccountByIdRow(accountId);
  if (!account) return 0;
  return account.openingBalanceMinor + (transactionDeltasByAccount(asOfDate).get(accountId) ?? 0);
}

export function listAccountsWithBalances(asOfDate?: string, scope: LifecycleScope = {}) {
  const deltas = transactionDeltasByAccount(asOfDate);
  return listAccounts(scope).map((account) => ({
    ...account,
    balanceMinor: account.openingBalanceMinor + (deltas.get(account.id) ?? 0),
  }));
}

/**
 * Sum of balances across the given accounts as of a date, **per currency**.
 *
 * Deliberately not a single number: adding a dollar balance to a rupee one is
 * the whole class of bug the currency column exists to prevent, and this
 * function cannot convert because conversion needs an as-of FX rate and the
 * caller's base currency. Callers convert with `service/utility/fx.ts` and
 * report the rates they used — see decision 8 and 16.
 */
export function getAccountsTotalByCurrency(
  accountIds: number[],
  asOfDate?: string,
): Map<Currency, number> {
  const deltas = transactionDeltasByAccount(asOfDate);
  const ids = new Set(accountIds);
  const totals = new Map<Currency, number>();
  // `includeArchived` because the caller already decided which accounts count
  // by passing their ids. Re-filtering here would silently drop an id the
  // caller deliberately included, which is how archiving an account with a
  // balance came to reduce reported net worth.
  for (const account of listAccounts({ includeArchived: true })) {
    if (!ids.has(account.id)) continue;
    const minor = account.openingBalanceMinor + (deltas.get(account.id) ?? 0);
    totals.set(account.currency, (totals.get(account.currency) ?? 0) + minor);
  }
  return totals;
}

/* ── Per-type terms satellites ───────────────────────────────────────────────
 * `credit_limit`, `interest_rate`, `original_amount`, `emi_amount` and
 * `tenure_months` used to be nullable columns on `finance_accounts`, null for
 * most of the eight account types. Migration 0028 moved them to one row per
 * account in `finance_loan_terms` / `finance_credit_terms`, so reading or
 * writing them is a second statement rather than five more columns. */

export type NewLoanTerms = typeof loanTerms.$inferInsert;
export type NewCreditTerms = typeof creditTerms.$inferInsert;

export function getLoanTerms(accountId: number) {
  return getDb().select().from(loanTerms).where(eq(loanTerms.accountId, accountId)).get() ?? null;
}

export function getCreditTerms(accountId: number) {
  return (
    getDb().select().from(creditTerms).where(eq(creditTerms.accountId, accountId)).get() ?? null
  );
}

/** The conflict target is the primary key, so it must not appear in the SET —
 * updating a row's own key to the value it already has is pointless, and on a
 * satellite keyed to its parent it is the one column that must never move. */
function withoutAccountId<T extends { accountId?: number }>(entry: T): Omit<T, "accountId"> {
  const updatable = { ...entry };
  delete (updatable as { accountId?: number }).accountId;
  return updatable;
}

/** Keyed by `account_id` (the primary key), so re-stating a loan's terms
 * replaces them rather than failing or leaving two rows to disagree. */
export function upsertLoanTerms(entry: NewLoanTerms) {
  return getDb()
    .insert(loanTerms)
    .values(entry)
    .onConflictDoUpdate({ target: loanTerms.accountId, set: withoutAccountId(entry) })
    .returning()
    .get();
}

export function upsertCreditTerms(entry: NewCreditTerms) {
  return getDb()
    .insert(creditTerms)
    .values(entry)
    .onConflictDoUpdate({ target: creditTerms.accountId, set: withoutAccountId(entry) })
    .returning()
    .get();
}

/**
 * Every loan and credit facility's terms in one pass, keyed by account id.
 *
 * Migration 0028 moved `interest_rate` and `credit_limit` off
 * `finance_accounts` into these two satellites, so anything that used to read
 * a rate or a limit from the account row now needs a join or a second query.
 * Doing it set-based once, rather than per account, keeps the debts page and
 * the insights engine from issuing a query per row.
 */
export interface AccountTermsRow {
  /** Annual rate in basis points — `loan_terms.rate_bps` for an amortizing
   * loan, `credit_terms.apr_bps` for a revolving facility. */
  rateBps: number | null;
  creditLimitMinor: number | null;
  /** The currency the limit is denominated in. It can differ from the
   * account's own currency, which is why utilization is only computed when the
   * two agree rather than converted at a rate nobody supplied. */
  limitCurrency: Currency | null;
  originalAmountMinor: number | null;
  emiMinor: number | null;
  tenureMonths: number | null;
  firstEmiDate: string | null;
  scheduleBasis: "reducing_balance" | "flat" | null;
}

export function listAccountTerms(): Map<number, AccountTermsRow> {
  const db = getDb();
  const terms = new Map<number, AccountTermsRow>();

  for (const row of db.select().from(loanTerms).all()) {
    terms.set(row.accountId, {
      rateBps: row.rateBps,
      creditLimitMinor: null,
      limitCurrency: null,
      originalAmountMinor: row.originalAmountMinor,
      emiMinor: row.emiMinor,
      tenureMonths: row.tenureMonths,
      firstEmiDate: row.firstEmiDate,
      scheduleBasis: row.scheduleBasis,
    });
  }

  for (const row of db.select().from(creditTerms).all()) {
    // An account takes one kind of terms or the other, never both — the
    // service refuses the wrong pairing — so this cannot clobber loan terms.
    terms.set(row.accountId, {
      rateBps: row.aprBps,
      creditLimitMinor: row.creditLimitMinor,
      limitCurrency: row.currency,
      originalAmountMinor: null,
      emiMinor: null,
      tenureMonths: null,
      firstEmiDate: null,
      scheduleBasis: null,
    });
  }

  return terms;
}

/* ── Write paths: edit in place, archive, delete ─────────────────────────────
 * Decision 17: an account is a descriptive row, so it is edited in place and
 * archived rather than deleted. The reference checks below are what make the
 * refusal real — a hard delete that got past them would orphan every
 * transaction leg on the account. */

export function updateAccount(id: number, patch: Partial<Omit<NewAccount, "id">>) {
  return getDb().update(accounts).set(patch).where(eq(accounts.id, id)).returning().get();
}

/** `null` un-archives. One function for both directions so the column is only
 * ever written in one place. */
export function archiveAccount(id: number, archivedAt: string | null) {
  return getDb().update(accounts).set({ archivedAt }).where(eq(accounts.id, id)).returning().get();
}

/**
 * Whether any transaction leg touches this account — either side of a transfer.
 *
 * Deliberately counts **voided** rows too. A void is a correction trail, not a
 * deletion: the voided row still names this account, and dropping the account
 * from under it would leave the trail pointing at nothing. This is also the
 * gate for the two edits that would reinterpret existing legs (currency, and a
 * type change that flips asset↔liability), so it must be the widest possible
 * reading of "has history".
 */
export function accountHasTransactions(id: number): boolean {
  return (
    getDb()
      .select({ id: transactions.id })
      .from(transactions)
      .where(or(eq(transactions.accountId, id), eq(transactions.toAccountId, id)))
      .get() !== undefined
  );
}

/** Everything that would be orphaned by a hard delete. The terms satellites are
 * excluded on purpose: they are owned by the account (one row, keyed to it) and
 * are removed with it, unlike history, which outlives it. */
export function accountHasReferences(id: number): boolean {
  if (accountHasTransactions(id)) return true;
  const db = getDb();
  const rule = db
    .select({ id: recurringRules.id })
    .from(recurringRules)
    .where(or(eq(recurringRules.accountId, id), eq(recurringRules.toAccountId, id)))
    .get();
  if (rule) return true;
  return (
    db
      .select({ id: investmentHoldings.id })
      .from(investmentHoldings)
      .where(eq(investmentHoldings.accountId, id))
      .get() !== undefined
  );
}

/** Only ever reached for an account nothing references — the service checks
 * first. The satellite rows go first because they hold the FK to the account. */
export function deleteAccount(id: number) {
  const db = getDb();
  db.delete(loanTerms).where(eq(loanTerms.accountId, id)).run();
  db.delete(creditTerms).where(eq(creditTerms.accountId, id)).run();
  db.delete(accounts).where(eq(accounts.id, id)).run();
}
