import {
  accountHasReferences,
  accountHasTransactions,
  archiveAccount,
  deleteAccount,
  getAccountByIdRow,
  getAccountBalanceMinor,
  getAccountsTotalByCurrency,
  getCreditTerms,
  getLoanTerms,
  insertAccount,
  listAccounts,
  listAccountsWithBalances,
  updateAccount,
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
 *
 * **Archived accounts are included.** Archiving is a UI affordance — it takes an
 * account out of pickers and listings — and it must not restate anybody's
 * accounts. Excluding them here would drop an archived account's balance out of
 * net worth, so retiring a row the user was finished *looking at* would appear
 * to destroy money. An account that is genuinely closed has a zero balance and
 * contributes nothing either way; one that does not is still money the user
 * holds. `exclude_from_net_worth` remains the explicit, opt-in way to leave
 * something out.
 */
export function getNetWorthByCurrency(asOfDate?: string): Map<Currency, number> {
  const included = listAccounts({ includeArchived: true })
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

/* ── Edit in place, archive, delete (decision 17) ────────────────────────────
 * An account is a descriptive row, so a correction edits it rather than
 * producing a second account; retiring it sets `archived_at`; and a hard delete
 * is only allowed when nothing references it. */

export interface EditAccountInput extends Partial<Omit<NewAccount, "id" | "createdAt">> {
  /** Replaces the loan satellite wholesale, same shape as on create. */
  loanTerms?: Omit<NewLoanTerms, "accountId" | "currency">;
  creditTerms?: Omit<NewCreditTerms, "accountId" | "currency">;
}

/**
 * Edits an account in place, re-applying every rule `createAccount` applies, so
 * an edit can never leave a row a create would have rejected.
 *
 * Two changes are refused outright once the account has history, because both
 * would silently reinterpret amounts already recorded against it rather than
 * describe them differently:
 *
 *  - **Currency.** It is pinned at the account precisely so every leg on it
 *    shares it (decision 6) and a balance is one exact integer sum. Changing it
 *    re-denominates every historical amount on the account without touching a
 *    single stored number — ₹1,00,000 of savings would read as $1,00,000.
 *  - **A type change that flips asset↔liability.** The sign convention is baked
 *    into each stored row (a liability's balance is negative), so flipping
 *    `kind` would invert the meaning of history with no safe inverse — see the
 *    comment on `normal_balance` in the schema.
 *
 * Both are offered an alternative that keeps history intact: archive this
 * account and create the replacement.
 */
export function editAccount(id: number, patch: EditAccountInput) {
  const existing = getAccountByIdRow(id);
  if (!existing) throw new DomainError("That account no longer exists.");

  const { loanTerms: loan, creditTerms: credit, ...accountPatch } = patch;
  const type = accountPatch.type ?? existing.type;
  const isLiability = LIABILITY_TYPES.has(type);
  const typeChanged = type !== existing.type;
  const kindFlips = isLiability !== (existing.kind === "liability");
  const hasHistory = accountHasTransactions(id);

  if (accountPatch.currency !== undefined && accountPatch.currency !== existing.currency) {
    if (hasHistory) {
      throw new DomainError(
        "This account already has transactions, so its currency can't be changed — every " +
          "amount on it is denominated in the current one. Archive it and create a new account " +
          "in the other currency instead.",
      );
    }
  }
  if (kindFlips && hasHistory) {
    throw new DomainError(
      "This account already has transactions, so it can't be changed between an asset and a " +
        "liability — the sign of every recorded amount depends on which it is. Archive it and " +
        "create the right kind of account instead.",
    );
  }

  // Recomputed from the (possibly new) type rather than carried over: the DB
  // CHECK requires `(kind='liability') = (normal_balance='credit')`, so a type
  // change that moved only one of the pair would be rejected as a raw
  // constraint failure. An explicit caller-supplied pair is still honoured and
  // still validated here, as a user-facing message rather than a SQLITE error.
  const kind =
    accountPatch.kind ?? (typeChanged ? (isLiability ? "liability" : "asset") : existing.kind);
  const normalBalance =
    accountPatch.normalBalance ??
    (typeChanged ? (isLiability ? "credit" : "debit") : existing.normalBalance);
  if ((kind === "liability") !== (normalBalance === "credit")) {
    throw new DomainError("An account's kind and normal balance must agree.");
  }

  if (loan && !LOAN_TERMS_TYPES.has(type)) {
    throw new DomainError("Only a loan account takes loan terms.");
  }
  if (credit && !CREDIT_TERMS_TYPES.has(type)) {
    throw new DomainError("Only a credit card or revolving credit account takes credit terms.");
  }

  const update: Partial<Omit<NewAccount, "id">> = {
    ...accountPatch,
    type,
    kind,
    normalBalance,
    // A type change moves the liquidity class with it unless the caller says
    // otherwise, or a home loan re-typed as savings would keep counting as a
    // cash buffer.
    liquidity:
      accountPatch.liquidity ?? (typeChanged ? LIQUIDITY_BY_TYPE[type] : existing.liquidity),
  };

  if (accountPatch.openingBalanceMinor !== undefined) {
    const openingBalanceMinor = accountPatch.openingBalanceMinor;
    if (!Number.isInteger(openingBalanceMinor)) {
      throw new DomainError("An opening balance must be a whole number of minor units.");
    }
    // Same convention as create: the caller passes a positive "amount owed".
    update.openingBalanceMinor = isLiability ? -Math.abs(openingBalanceMinor) : openingBalanceMinor;
  } else if (kindFlips) {
    // Only reachable with no history (refused above otherwise), so re-signing
    // the opening balance cannot contradict anything already recorded.
    update.openingBalanceMinor = isLiability
      ? -Math.abs(existing.openingBalanceMinor)
      : Math.abs(existing.openingBalanceMinor);
  }

  const account = updateAccount(id, update);

  // Pinned to the account's currency for the same reason create does it: a
  // limit denominated differently from the balance it bounds is uncomparable.
  if (loan) upsertLoanTerms({ ...loan, accountId: id, currency: account.currency });
  if (credit) upsertCreditTerms({ ...credit, accountId: id, currency: account.currency });

  return account;
}

/**
 * Retires an account without touching a number.
 *
 * Archiving is a *picker* concern: the account drops out of the lists people
 * choose from, while every transaction on it keeps counting, so no balance,
 * net-worth or report figure moves. `listAccounts` and everything built on it
 * already exclude archived rows from listings (queries/lifecycle.ts), which is
 * why nothing here filters again.
 */
export function archiveAccountById(id: number) {
  if (!getAccountByIdRow(id)) throw new DomainError("That account no longer exists.");
  return archiveAccount(id, todayIso());
}

export function unarchiveAccountById(id: number) {
  if (!getAccountByIdRow(id)) throw new DomainError("That account no longer exists.");
  return archiveAccount(id, null);
}

/**
 * Hard-deletes an account, and **refuses** when anything references it.
 *
 * The refusal is the point: a transaction, a recurring rule or a holding
 * pointing at a deleted account is history that can no longer say where the
 * money was, and there is no way back from that. Archiving does everything a
 * delete was wanted for — the account disappears from pickers — without it.
 */
export function deleteAccountById(id: number) {
  if (!getAccountByIdRow(id)) throw new DomainError("That account no longer exists.");
  if (accountHasReferences(id)) {
    throw new DomainError(
      "This account has transactions, recurring rules or holdings recorded against it, so it " +
        "can't be deleted. Archive it instead — it will be hidden from pickers and every " +
        "existing record stays intact.",
    );
  }
  deleteAccount(id);
}
