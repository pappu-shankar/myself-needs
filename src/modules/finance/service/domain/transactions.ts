import {
  countTransactions,
  getTransactionRowById,
  insertTransaction,
  listRecentTransactions,
  listTransactionsByCursor,
  markTransactionVoided,
  setTransactionSupersededBy,
  type NewTransaction,
  type TransactionsCursorPageParams,
} from "../../db/queries/domain/transactions";
import { getAccountByIdRow } from "../../db/queries/domain/accounts";
import { getCategoryByIdRow } from "../../db/queries/domain/categories";
import { DomainError } from "@/modules/core/errors";
import { getDb } from "@/modules/core/db/client";
import { todayIso } from "@/lib/dates";

function assertIsoDate(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainError("Transaction date must be a valid calendar date.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainError("Transaction date must be a valid calendar date.");
  }
}

/**
 * Validates the entry and returns it with both currencies pinned to the
 * accounts they belong to.
 *
 * Currency is a property of the account (decision 6), so it is derived here
 * rather than trusted from the caller — a transaction whose `currency` differed
 * from its account's would make that account's balance a sum of two
 * denominations. A caller may still state it, and a disagreement is an error
 * rather than a silent overwrite.
 */
function normalizeTransaction(entry: NewTransaction): NewTransaction {
  if (!Number.isInteger(entry.amountMinor) || entry.amountMinor <= 0) {
    throw new DomainError("Transaction amount must be greater than zero.");
  }
  assertIsoDate(entry.date);

  const account = getAccountByIdRow(entry.accountId);
  if (!account) {
    throw new DomainError("The source account no longer exists.");
  }
  if (entry.currency != null && entry.currency !== account.currency) {
    throw new DomainError("A transaction must be in its account's currency.");
  }

  if (entry.type === "transfer") {
    if (entry.toAccountId == null || entry.toAccountId === entry.accountId) {
      throw new DomainError("A transfer needs a different destination account.");
    }
    if (entry.categoryId != null) {
      throw new DomainError("Transfers cannot have a category.");
    }
    const toAccount = getAccountByIdRow(entry.toAccountId);
    if (!toAccount) {
      throw new DomainError("The destination account no longer exists.");
    }
    if (entry.toCurrency != null && entry.toCurrency !== toAccount.currency) {
      throw new DomainError("A transfer must land in the destination account's currency.");
    }

    // A cross-currency transfer carries both legs, so the rate that actually
    // applied is implied by the two amounts and never needs a lookup — the
    // truth is what the bank did, not what a daily reference rate says. That
    // makes the incoming amount required, not optional: deriving it from a
    // rate would record a figure the bank never moved. Conversely a
    // same-currency transfer must not carry a second leg, or the two sides
    // could disagree about one movement.
    const crossCurrency = account.currency !== toAccount.currency;
    if (crossCurrency) {
      if (entry.toAmountMinor == null) {
        throw new DomainError(
          "A transfer between accounts in different currencies needs the amount received.",
        );
      }
      if (!Number.isInteger(entry.toAmountMinor) || entry.toAmountMinor <= 0) {
        throw new DomainError("The amount received must be greater than zero.");
      }
    } else if (entry.toAmountMinor != null) {
      throw new DomainError(
        "A transfer between accounts in the same currency moves a single amount.",
      );
    }

    return {
      ...entry,
      currency: account.currency,
      toCurrency: crossCurrency ? toAccount.currency : null,
      toAmountMinor: crossCurrency ? entry.toAmountMinor : null,
    };
  }

  if (entry.toAccountId != null) {
    throw new DomainError("Only transfers can have a destination account.");
  }
  if (entry.toAmountMinor != null || entry.toCurrency != null) {
    throw new DomainError("Only transfers can have a destination amount.");
  }

  const normalized: NewTransaction = { ...entry, currency: account.currency };
  if (entry.categoryId == null) return normalized;

  const category = getCategoryByIdRow(entry.categoryId);
  if (!category) throw new DomainError("The selected category no longer exists.");
  if (category.type !== entry.type) {
    throw new DomainError("The category does not match the transaction type.");
  }
  return normalized;
}

export function getTransactionsPage(params: TransactionsCursorPageParams = {}, pageSize?: number) {
  return listTransactionsByCursor(params, pageSize);
}

export function getTransactionsCount() {
  return countTransactions();
}

/** Whether any transaction has ever been logged — for "getting started" style checks. */
export function getHasAnyTransactions() {
  return getTransactionsCount() > 0;
}

export function getRecentTransactions(limit = 5) {
  return listRecentTransactions(limit);
}

export function createTransaction(entry: NewTransaction) {
  return insertTransaction(normalizeTransaction(entry));
}

// ---------------------------------------------------------------------------
// Void and correct (decision 17: ledger rows are immutable)
// ---------------------------------------------------------------------------

/**
 * A void with no stated reason is how a correction trail becomes useless: the
 * row says it was reversed and nothing says why, which is strictly worse than
 * a wrong number nobody touched. So the reason is required here too, not only
 * in the form schema — a programmatic caller gets the same rule.
 */
function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === "") throw new DomainError("Say why this transaction is being reversed.");
  return trimmed;
}

/** The row, voided or not — for a detail view and for the correction trail. */
export function getTransaction(id: number) {
  return getTransactionRowById(id) ?? null;
}

export interface TransactionCorrectionTrail {
  /** The row asked for, whatever its state. */
  row: NonNullable<ReturnType<typeof getTransactionRowById>>;
  /** The row that replaced it, when it was corrected rather than just voided. */
  replacement: NonNullable<ReturnType<typeof getTransactionRowById>> | null;
}

/**
 * A row together with whatever replaced it, so the UI can show "reversed —
 * see this instead" without a second round trip and without guessing which
 * direction the link points.
 */
export function getTransactionCorrectionTrail(id: number): TransactionCorrectionTrail | null {
  const row = getTransactionRowById(id);
  if (!row) return null;
  const replacement =
    row.supersededById === null ? null : (getTransactionRowById(row.supersededById) ?? null);
  return { row, replacement };
}

/**
 * Reverses a transaction without replacing it — the entry should never have
 * existed at all. The row stays readable (`{ includeVoided: true }`) with its
 * reason; every money query already excludes it, which for a transfer means
 * both accounts move back, not just the source.
 */
export function voidTransaction(id: number, reason: string) {
  const stated = requireReason(reason);
  const existing = getTransactionRowById(id);
  if (!existing) throw new DomainError("That transaction no longer exists.");
  if (existing.voidedAt !== null) {
    throw new DomainError("That transaction has already been reversed.");
  }
  const voided = markTransactionVoided(id, todayIso(), stated);
  // Lost the race against a concurrent void: the other one's reason stands.
  if (!voided) throw new DomainError("That transaction has already been reversed.");
  return voided;
}

export interface TransactionCorrection {
  voided: NonNullable<ReturnType<typeof markTransactionVoided>>;
  replacement: ReturnType<typeof insertTransaction>;
}

/**
 * Corrects a transaction: voids the original and inserts `replacement`, with
 * the voided row pointing forward at the new one.
 *
 * The replacement goes through `createTransaction`, so a correction cannot
 * slip past a rule a create would have caught (a category of the wrong type, a
 * transfer to the same account, a cross-currency transfer missing its second
 * leg). Both halves run in one DB transaction: a voided row with no
 * replacement, or a replacement nothing points at, would each read as a
 * different history than what happened.
 */
export function correctTransaction(
  id: number,
  replacement: NewTransaction,
  reason: string,
): TransactionCorrection {
  const stated = requireReason(reason);
  const original = getTransactionRowById(id);
  if (!original) throw new DomainError("That transaction no longer exists.");
  if (original.supersededById !== null) {
    throw new DomainError(
      "That transaction has already been corrected. Correct its replacement instead, so the trail stays one chain.",
    );
  }
  if (original.voidedAt !== null) {
    throw new DomainError("That transaction was already reversed, so there is nothing to correct.");
  }
  // A correction is always a new row. Accepting an id (or a void stamp) from
  // the caller is how a row ends up superseding itself, or being born already
  // reversed, and both break the chain the trail is read from.
  if (replacement.id != null) {
    throw new DomainError("A correction is a new transaction and cannot reuse an existing id.");
  }
  if (
    replacement.voidedAt != null ||
    replacement.voidReason != null ||
    replacement.supersededById != null
  ) {
    throw new DomainError("A correction cannot be entered as already reversed.");
  }
  // A recurring-generated transaction *can* be corrected in place now: since
  // migration 0030 the `(recurring_rule_id, period_start)` unique index
  // excludes voided rows, so the replacement no longer collides with the row it
  // replaces. The correction keeps the rule link and the period, which is what
  // makes the period read as still confirmed rather than bouncing back into the
  // due worklist mid-correction.

  return getDb().transaction(() => {
    const voided = markTransactionVoided(id, todayIso(), stated);
    if (!voided) throw new DomainError("That transaction has already been reversed.");
    const created = createTransaction(replacement);
    const linked = setTransactionSupersededBy(id, created.id);
    if (!linked) throw new DomainError("That transaction has already been corrected.");
    return { voided: linked, replacement: created };
  });
}
