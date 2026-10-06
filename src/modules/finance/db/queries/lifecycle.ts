import { isNull, isNotNull, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * The filters that make void and archive mean something.
 *
 * Adding the columns was the easy half. The hazard is the query that forgets
 * the filter: a voided transaction still summed into a balance is worse than no
 * void feature at all, because the UI now shows a correction trail that says
 * the row was reversed while the number says it was not. The specific trap in
 * this codebase is `transactionDeltasByAccount`, whose UNION ALL has *two*
 * legs — filtering one and not the other makes a voided transfer vanish from
 * the source account and persist in the destination.
 *
 * Every exported query that touches money applies one of these. The guard is
 * `lifecycle-recall.test.ts`: with every row voided, every money query must
 * return zero, which catches the filters nobody thought of rather than only
 * the two they did.
 */

/** Rows that still count. */
export function live(voidedAt: SQLiteColumn): SQL {
  return isNull(voidedAt);
}

/** Rows that have been reversed — for the correction trail, which has to show
 * both the mistake and its replacement. */
export function voided(voidedAt: SQLiteColumn): SQL {
  return isNotNull(voidedAt);
}

/** Descriptive rows still in use. Archived ones are kept because history
 * references them, so they are never deleted, only hidden from pickers. */
export function unarchived(archivedAt: SQLiteColumn): SQL {
  return isNull(archivedAt);
}

/** Raw-SQL equivalent, for the hand-written UNION in `domain/accounts.ts`.
 * A string rather than a `SQL` fragment because it is interpolated into a
 * template that builds both legs the same way. */
export const LIVE_SQL = "voided_at IS NULL";

/**
 * Whether a listing includes rows that no longer count. Defaulting to
 * excluded is the safe direction: a caller that forgets the option gets the
 * correct number, not a silently inflated one.
 */
export interface LifecycleScope {
  includeVoided?: boolean;
  includeArchived?: boolean;
}
