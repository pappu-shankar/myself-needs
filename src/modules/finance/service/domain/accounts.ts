import {
  getAccountByIdRow,
  getAccountBalanceMinor,
  getAccountsTotalByCurrency,
  getCreditTerms,
  getLoanTerms,
  insertAccount,
  listAccounts,
  listAccountsWithBalances,
  upsertCreditTerms,
  upsertLoanTerms,
  type NewAccount,
  type NewCreditTerms,
  type NewLoanTerms,
} from "../../db/queries/domain/accounts";
import { listAccountTerms } from "../../db/queries/domain/accounts";
import type { Currency } from "../../db/schema/currency";
import { aggregateToBase, type MoneyAggregate } from "../utility/aggregate";
import type { FxRate } from "../utility/fx";
import { getBaseCurrency } from "../../db/queries/config/settings";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";

/**
 * Sign convention: asset accounts (checking/savings/cash/investment/receivable)
 * carry a positive balance; liability accounts (credit_card/revolving_credit/
 * loan) carry a *negative* balance representing the amount owed. This means a
 * net-worth figure is a single signed sum per currency with no special-casing,
 * and a "payment" toward a liability is simply a transfer into it (adding a
 * positive amount moves a negative balance toward zero) while a "charge" is an
 * expense against it (subtracting moves it further negative). `createAccount`
 * below negates `openingBalanceMinor` for liability types so callers always
 * pass a positive "amount owed" and the stored sign convention stays
 * consistent.
 */
const LIABILITY_TYPES = new Set<NewAccount["type"]>(["credit_card", "revolving_credit", "loan"]);

/** Which types take which terms satellite. A revolving facility draws against
 * a limit with no fixed EMI, so it takes credit terms even though it is a
 * liability like a loan — see docs/prd/finance/debts-loans.md. */
const CREDIT_TERMS_TYPES = new Set<NewAccount["type"]>(["credit_card", "revolving_credit"]);
const LOAN_TERMS_TYPES = new Set<NewAccount["type"]>(["loan"]);

/** Liquidity is the discriminator for "is this a cash buffer", backfilled from
 * `type` in migration 0027. New rows have to be stamped here or they take the
 * column default (`liquid`) — which would quietly count a home loan as cash. */
const LIQUIDITY_BY_TYPE: Record<NewAccount["type"], NewAccount["liquidity"]> = {
  checking: "liquid",
  savings: "liquid",
  cash: "liquid",
  investment: "semi_liquid",
  receivable: "illiquid",
  credit_card: "liquid",
  revolving_credit: "liquid",
  loan: "liquid",
};

export function getAccounts(asOfDate?: string) {
  return listAccountsWithBalances(asOfDate);
}

/** One account's balance in **its own currency's minor units** — never
 * converted, because a conversion needs an as-of rate the caller owns. */
export function getAccountBalanceMinorById(id: number, asOfDate?: string): number {
  return getAccountBalanceMinor(id, asOfDate);
}

export function getAccount(id: number) {
  return getAccountByIdRow(id) ?? null;
}

/** The loan or credit terms attached to an account, whichever applies. Null
 * for both on an account type that takes neither. */
export function getAccountTerms(id: number) {
  return { loan: getLoanTerms(id), credit: getCreditTerms(id) };
}

/**
 * Net worth as per-currency subtotals, excluding accounts flagged out of it.
 *
 * Deliberately not one number: adding a dollar balance to a rupee one is the
 * bug the currency column exists to prevent. `getNetWorth` below converts
 * these, and states the rates it used.
 */
export function getNetWorthByCurrency(asOfDate?: string): Map<Currency, number> {
  const included = listAccounts()
    .filter((a) => !a.excludeFromNetWorth)
    .map((a) => a.id);
  return getAccountsTotalByCurrency(included, asOfDate);
}

export interface BaseConversionOptions {
  /** Dated rates to convert with. Defaults to every stored rate usable as of
   * `asOf`; an empty set means only the base currency itself resolves
   * (identity) and every other currency comes back unresolved rather than
   * converted at a guessed rate. */
  rates?: readonly FxRate[];
  /** Defaults to `financeSettings.baseCurrency`, a read-time display setting. */
  baseCurrency?: Currency;
  /** The date the rates are taken as of. Defaults to today. */
  asOf?: string;
}

/** An explicit base currency, else the vault's reporting setting. */
export function resolveBaseCurrency(override?: Currency): Currency {
  return override ?? getBaseCurrency();
}

/** The conversion basis a report runs on: an explicit one if the caller has it
 * (a test, or a page that already loaded the rates), otherwise read from the
 * vault. Shared so every aggregate in the module resolves it the same way. */
export function resolveConversionBasis(options: BaseConversionOptions = {}): {
  baseCurrency: Currency;
  asOf: string;
  rates: readonly FxRate[];
} {
  const asOf = options.asOf ?? todayIso();
  return {
    baseCurrency: resolveBaseCurrency(options.baseCurrency),
    asOf,
    rates: options.rates ?? listFxRatesAsOf(asOf),
  };
}

/**
 * Net worth converted into the base currency, carrying the rate used for each
 * contributing currency plus whether anything failed to resolve. A caller
 * showing `baseMinor` must also show `complete`/`stale` — an incomplete total
 * is a short number, not a smaller one.
 */
export function getNetWorth(
  options: BaseConversionOptions & { asOfDate?: string } = {},
): MoneyAggregate {
  // The balance's as-of date doubles as the rate's when one isn't given: a
  // point-in-time net worth converted at today's rate is two different dates
  // reported as one figure.
  const basis = resolveConversionBasis({ ...options, asOf: options.asOf ?? options.asOfDate });
  return aggregateToBase(getNetWorthByCurrency(options.asOfDate), basis);
}

export interface CreateAccountInput extends NewAccount {
  /** Amortization reference data for a `loan`. Rejected for other types. */
  loanTerms?: Omit<NewLoanTerms, "accountId" | "currency">;
  /** Limit/APR reference data for a `credit_card` or `revolving_credit`. */
  creditTerms?: Omit<NewCreditTerms, "accountId" | "currency">;
}

/**
 * Creates the account row and, where the type takes them, its terms satellite.
 *
 * `kind`/`normalBalance` are derived from `type` rather than left to the column
 * defaults (`asset`/`debit`): a liability created with the defaults would pass
 * the DB CHECK — the two columns agree with each other — while still reading as
 * an asset in every kind-based sum. Caller-supplied values are honoured but
 * must be a consistent pair, which is what the CHECK enforces at the DB and
 * this reports as a user-facing error instead of a constraint failure.
 */
export function createAccount(entry: CreateAccountInput) {
  const { loanTerms: loan, creditTerms: credit, ...accountEntry } = entry;
  const isLiability = LIABILITY_TYPES.has(accountEntry.type);

  const kind = accountEntry.kind ?? (isLiability ? "liability" : "asset");
  const normalBalance = accountEntry.normalBalance ?? (isLiability ? "credit" : "debit");
  if ((kind === "liability") !== (normalBalance === "credit")) {
    throw new DomainError("An account's kind and normal balance must agree.");
  }

  if (loan && !LOAN_TERMS_TYPES.has(accountEntry.type)) {
    throw new DomainError("Only a loan account takes loan terms.");
  }
  if (credit && !CREDIT_TERMS_TYPES.has(accountEntry.type)) {
    throw new DomainError("Only a credit card or revolving credit account takes credit terms.");
  }

  const openingBalanceMinor = accountEntry.openingBalanceMinor ?? 0;
  if (!Number.isInteger(openingBalanceMinor)) {
    throw new DomainError("An opening balance must be a whole number of minor units.");
  }

  const account = insertAccount({
    ...accountEntry,
    kind,
    normalBalance,
    liquidity: accountEntry.liquidity ?? LIQUIDITY_BY_TYPE[accountEntry.type],
    openingBalanceMinor: isLiability ? -Math.abs(openingBalanceMinor) : openingBalanceMinor,
  });

  // The satellite's currency is pinned to the account's rather than taken from
  // the caller: a limit denominated differently from the balance it bounds
  // could never be compared against it.
  if (loan) upsertLoanTerms({ ...loan, accountId: account.id, currency: account.currency });
  if (credit) upsertCreditTerms({ ...credit, accountId: account.id, currency: account.currency });

  return account;
}

/**
 * The currency an amount typed against this account is denominated in.
 *
 * Exists so the action layer converts a user-typed major-unit figure with the
 * *right* exponent instead of assuming two decimal places. All four launch
 * currencies happen to be 2-decimal, which is exactly why this is worth
 * routing through one function: the day JPY or KWD is added, a hardcoded 100
 * at a form boundary is a silent factor-of-100 error, and there would be no
 * failing test to find it.
 */
export function getAccountCurrency(accountId: number): Currency {
  const account = getAccountByIdRow(accountId);
  if (!account) throw new DomainError("That account no longer exists.");
  return account.currency;
}

/**
 * Rate, limit and amortization terms per debt account, keyed by account id —
 * one query for the whole set, for the debts page and the insights engine.
 */
export function getDebtTermsByAccount() {
  return listAccountTerms();
}
