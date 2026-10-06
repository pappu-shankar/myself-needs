// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { closeDatabase } from "@/modules/core/db/client";
import { todayIso } from "@/lib/dates";
import { valueOfUnits } from "../service/utility/units";

/**
 * Guards the backfills hand-added to 0027 — the entity/institution/currency/
 * provenance/lifecycle foundation. Same harness as money-migration.test.ts:
 * migrate to the state *before* the target tag, insert old-shape rows with raw
 * SQL, then run the full journal and assert through the migrated database.
 */
const FOUNDATION_MIGRATION = "0027_narrow_ken_ellis";
const DRIZZLE = path.join(process.cwd(), "drizzle");
const tmp = path.join(process.cwd(), ".vitest-tmp", randomUUID());

afterEach(() => {
  closeDatabase();
  rmSync(tmp, { recursive: true, force: true });
});

function migrationsUpTo(tagExclusive: string): string {
  const dir = path.join(tmp, "before");
  cpSync(DRIZZLE, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const cut = journal.entries.findIndex((e: { tag: string }) => e.tag === tagExclusive);
  expect(cut).toBeGreaterThan(-1);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

/** Mirrors openVault: foreign keys off while migrating, verified after. */
function runFullJournal(connection: Database.Database) {
  connection.pragma("foreign_keys = OFF");
  migrate(drizzle(connection), { migrationsFolder: DRIZZLE });
  connection.pragma("foreign_keys = ON");
  expect(connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
}

function seedPreMigrationVault(connection: Database.Database) {
  connection
    .prepare(
      `INSERT INTO finance_accounts
         (id, name, type, opening_balance, credit_limit, interest_rate, original_amount, emi_amount, tenure_months) VALUES
         (1, 'Savings', 'savings', 10000, NULL, NULL, NULL, NULL, NULL),
         (2, 'Brokerage', 'investment', 500000, NULL, NULL, NULL, NULL, NULL),
         (3, 'Home loan', 'loan', -2000000, NULL, 8.65, 5000000000, 4123456, 240),
         (4, 'Amex', 'credit_card', -5000, 20000000, 42.5, NULL, NULL, NULL),
         (5, 'Owed by Raj', 'receivable', 25000, NULL, NULL, NULL, NULL, NULL)`,
    )
    .run();
  connection
    .prepare("INSERT INTO finance_categories (id, name, type) VALUES (1, 'Food', 'expense')")
    .run();
  connection
    .prepare(
      "INSERT INTO finance_transactions (id, type, account_id, category_id, amount, date) VALUES (1, 'expense', 1, 1, 50000, '2024-03-15')",
    )
    .run();
  connection
    .prepare(
      `INSERT INTO finance_investment_holdings (id, type, name, units, interest_rate) VALUES
         (1, 'equity', 'Acme Corp', 100, NULL),
         (2, 'govt_scheme', 'PPF', NULL, NULL),
         (3, 'intl_equity', 'Apple', 10, NULL),
         (4, 'equity', 'Fractional', 1234.5678, NULL),
         (5, 'equity', 'Huge', 10000000, NULL),
         (6, 'fd', 'SBI FD', NULL, 7.15)`,
    )
    .run();
  connection
    .prepare(
      `INSERT INTO finance_investment_valuations (id, holding_id, date, price_per_unit) VALUES
         (1, 1, '2024-06-30', 250.5),
         (2, 4, '2024-06-30', 0.0001),
         (3, 5, '2024-06-30', 99999.99)`,
    )
    .run();
  // Two policies share a provider; a third differs. Tests DISTINCT + the guard.
  connection
    .prepare(
      `INSERT INTO finance_insurance_policies (id, type, provider, name, premium_amount, premium_frequency, start_date) VALUES
         (1, 'life', 'HDFC Life', 'Term 1Cr', 12000, 'yearly', '2023-04-01'),
         (2, 'health', 'HDFC Life', 'Family floater', 24000, 'yearly', '2023-05-01'),
         (3, 'vehicle', 'ICICI Lombard', 'Car', 8000, 'yearly', '2024-01-01')`,
    )
    .run();
}

describe("foundation migration (entities, institutions, currency, provenance, lifecycle)", () => {
  it("backfills existing data without inventing anything it cannot know", () => {
    const connection = new Database(":memory:");
    connection.pragma("foreign_keys = ON");
    migrate(drizzle(connection), { migrationsFolder: migrationsUpTo(FOUNDATION_MIGRATION) });
    seedPreMigrationVault(connection);

    runFullJournal(connection);

    // One Self entity, owning itself outright, effective from the sentinel date
    // so an as-of lookup at any historical date resolves.
    const entities = connection.prepare("SELECT id, kind, name FROM finance_entities").all();
    expect(entities).toEqual([{ id: 1, kind: "personal", name: "Self" }]);
    expect(
      connection
        .prepare(
          "SELECT entity_id, holder_entity_id, ownership_bps, effective_from FROM finance_entity_stakes",
        )
        .all(),
    ).toEqual([
      { entity_id: 1, holder_entity_id: 1, ownership_bps: 10000, effective_from: "1970-01-01" },
    ]);

    // Every account and holding attributed to Self — the one entity attribution
    // that is safe to infer, because the vault is one user's.
    expect(
      connection.prepare("SELECT COUNT(*) AS n FROM finance_accounts WHERE entity_id = 1").get(),
    ).toEqual({ n: 5 });
    expect(
      connection
        .prepare("SELECT COUNT(*) AS n FROM finance_investment_holdings WHERE entity_id = 1")
        .get(),
    ).toEqual({ n: 6 });

    // kind/normal_balance make the existing sign convention explicit. The stored
    // sign is untouched: the loan is still negative.
    expect(
      connection
        .prepare(
          "SELECT id, kind, normal_balance, liquidity, opening_balance_minor FROM finance_accounts ORDER BY id",
        )
        .all(),
    ).toEqual([
      {
        id: 1,
        kind: "asset",
        normal_balance: "debit",
        liquidity: "liquid",
        opening_balance_minor: 10000,
      },
      {
        id: 2,
        kind: "asset",
        normal_balance: "debit",
        liquidity: "semi_liquid",
        opening_balance_minor: 500000,
      },
      {
        id: 3,
        kind: "liability",
        normal_balance: "credit",
        liquidity: "liquid",
        opening_balance_minor: -2000000,
      },
      {
        id: 4,
        kind: "liability",
        normal_balance: "credit",
        liquidity: "liquid",
        opening_balance_minor: -5000,
      },
      {
        id: 5,
        kind: "asset",
        normal_balance: "debit",
        liquidity: "illiquid",
        opening_balance_minor: 25000,
      },
    ]);

    expect(
      connection.prepare("SELECT id, liquidity FROM finance_investment_holdings ORDER BY id").all(),
    ).toEqual([
      { id: 1, liquidity: "liquid" },
      { id: 2, liquidity: "illiquid" },
      { id: 3, liquidity: "liquid" },
      { id: 4, liquidity: "liquid" },
      { id: 5, liquidity: "liquid" },
      { id: 6, liquidity: "semi_liquid" },
    ]);

    // as_of comes from the row's own date, never from "now" — back-stamping
    // history as freshly observed would destroy the staleness signal.
    const tx = connection
      .prepare("SELECT as_of, currency, source, method FROM finance_transactions")
      .get() as Record<string, string>;
    expect(tx.as_of).toBe("2024-03-15");
    expect(tx.as_of).not.toBe(todayIso());
    expect(tx).toMatchObject({ currency: "INR", source: "user", method: "manual" });

    // A pre-existing valuation cannot say where its price came from: a refreshed
    // NAV and a hand-typed figure are indistinguishable in the old schema, so
    // the migration refuses to guess rather than claiming `manual`.
    expect(
      connection
        .prepare(
          "SELECT as_of, price_currency, source, method, confidence FROM finance_investment_valuations",
        )
        .get(),
    ).toEqual({
      as_of: "2024-06-30",
      price_currency: "INR",
      source: "unknown",
      method: "unknown",
      confidence: "unknown",
    });

    // The one derivable institution attribution: a policy's free-text provider
    // already *is* an insurer's name. Two policies share one, so DISTINCT must
    // collapse them to a single row.
    expect(
      connection.prepare("SELECT id, name, kind FROM finance_institutions ORDER BY id").all(),
    ).toEqual([
      { id: 1, name: "HDFC Life", kind: "insurer" },
      { id: 2, name: "ICICI Lombard", kind: "insurer" },
    ]);
    expect(
      connection
        .prepare("SELECT id, institution_id, as_of FROM finance_insurance_policies ORDER BY id")
        .all(),
    ).toEqual([
      { id: 1, institution_id: 1, as_of: "2023-04-01" },
      { id: 2, institution_id: 1, as_of: "2023-05-01" },
      { id: 3, institution_id: 2, as_of: "2024-01-01" },
    ]);

    // Accounts and holdings are deliberately left unattributed: their only
    // signal is a name like "Savings", and guessing an institution from that is
    // worse than leaving it for the user.
    expect(
      connection
        .prepare("SELECT COUNT(*) AS n FROM finance_accounts WHERE institution_id IS NOT NULL")
        .get(),
    ).toEqual({ n: 0 });
  });

  it("migrates an empty new vault with foreign keys on throughout", () => {
    // Mirrors src/test/db.ts, which sets foreign_keys = ON *before* migrating,
    // unlike production. An `ADD COLUMN ... NOT NULL DEFAULT ... REFERENCES`
    // would pass in production and fail here, so this is the guard against a
    // migration that only breaks the test suite. Also the no-backup path:
    // client.ts only backs up when migrations were already applied.
    const connection = new Database(":memory:");
    connection.pragma("foreign_keys = ON");
    migrate(drizzle(connection), { migrationsFolder: DRIZZLE });

    expect(connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(connection.prepare("SELECT kind, name FROM finance_entities").all()).toEqual([
      { kind: "personal", name: "Self" },
    ]);
    expect(connection.prepare("SELECT COUNT(*) AS n FROM finance_entity_stakes").get()).toEqual({
      n: 1,
    });
    expect(connection.prepare("SELECT base_currency FROM finance_settings").all()).toEqual([]);
  });

  it("does not duplicate seeded rows when the journal is replayed", () => {
    const connection = new Database(":memory:");
    connection.pragma("foreign_keys = ON");
    migrate(drizzle(connection), { migrationsFolder: migrationsUpTo(FOUNDATION_MIGRATION) });
    seedPreMigrationVault(connection);
    runFullJournal(connection);

    // A second run is a no-op for applied migrations, but the guards are what
    // make a partially-applied retry safe, so assert the invariant directly.
    migrate(drizzle(connection), { migrationsFolder: DRIZZLE });

    expect(connection.prepare("SELECT COUNT(*) AS n FROM finance_entities").get()).toEqual({
      n: 1,
    });
    expect(connection.prepare("SELECT COUNT(*) AS n FROM finance_entity_stakes").get()).toEqual({
      n: 1,
    });
    expect(connection.prepare("SELECT COUNT(*) AS n FROM finance_institutions").get()).toEqual({
      n: 2,
    });
  });

  it("moves loan and card terms into the satellites before dropping the columns", () => {
    // Migration 0023 proved the rebuild idiom will insert a column subset
    // *without erroring*, so a satellite that quietly ended up empty would look
    // exactly like a successful migration. Hence asserting the values, not just
    // that the tables exist.
    const connection = new Database(":memory:");
    connection.pragma("foreign_keys = ON");
    migrate(drizzle(connection), { migrationsFolder: migrationsUpTo(FOUNDATION_MIGRATION) });
    seedPreMigrationVault(connection);

    runFullJournal(connection);

    // All four loan fields survive. The rate was a REAL percentage and is now
    // integer basis points: 8.65% -> 865.
    expect(
      connection
        .prepare(
          "SELECT account_id, original_amount_minor, emi_minor, tenure_months, rate_bps, currency, schedule_basis FROM finance_loan_terms",
        )
        .all(),
    ).toEqual([
      {
        account_id: 3,
        original_amount_minor: 5000000000,
        emi_minor: 4123456,
        tenure_months: 240,
        rate_bps: 865,
        currency: "INR",
        schedule_basis: "reducing_balance",
      },
    ]);

    // The card limit survives, and its APR too — 42.5% -> 4250 bps.
    expect(
      connection
        .prepare(
          "SELECT account_id, credit_limit_minor, apr_bps, currency FROM finance_credit_terms",
        )
        .all(),
    ).toEqual([{ account_id: 4, credit_limit_minor: 20000000, apr_bps: 4250, currency: "INR" }]);

    // A satellite row is created only where a term actually had a value, so a
    // plain savings account does not acquire an all-null loan row.
    expect(connection.prepare("SELECT COUNT(*) AS n FROM finance_loan_terms").get()).toEqual({
      n: 1,
    });

    // The five columns are gone from the account table, and the ledger-derived
    // balance is untouched by the rebuild.
    const columns = connection
      .prepare("SELECT name FROM pragma_table_info('finance_accounts')")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const dropped of [
      "credit_limit",
      "interest_rate",
      "original_amount",
      "emi_amount",
      "tenure_months",
      "opening_balance",
    ]) {
      expect(columns, dropped).not.toContain(dropped);
    }
    expect(columns).toContain("opening_balance_minor");
    expect(
      connection
        .prepare("SELECT opening_balance_minor AS b FROM finance_accounts WHERE id = 3")
        .get(),
    ).toEqual({ b: -2000000 });
  });

  it("scales units and prices to integers without losing a paisa", () => {
    const connection = new Database(":memory:");
    connection.pragma("foreign_keys = ON");
    migrate(drizzle(connection), { migrationsFolder: migrationsUpTo(FOUNDATION_MIGRATION) });
    seedPreMigrationVault(connection);

    runFullJournal(connection);

    // Units scale by 1e6, prices by 1e6, independent of currency exponent.
    expect(
      connection
        .prepare("SELECT id, units_scaled, rate_bps FROM finance_investment_holdings ORDER BY id")
        .all(),
    ).toEqual([
      { id: 1, units_scaled: 100_000_000, rate_bps: null },
      { id: 2, units_scaled: null, rate_bps: null },
      { id: 3, units_scaled: 10_000_000, rate_bps: null },
      { id: 4, units_scaled: 1_234_567_800, rate_bps: null },
      { id: 5, units_scaled: 10_000_000_000_000, rate_bps: null },
      // An FD's accrual rate: 7.15% -> 715 bps.
      { id: 6, units_scaled: null, rate_bps: 715 },
    ]);
    expect(
      connection
        .prepare("SELECT id, price_scaled FROM finance_investment_valuations ORDER BY id")
        .all(),
    ).toEqual([
      { id: 1, price_scaled: 250_500_000 },
      // A price below one minor unit still scales exactly rather than to zero.
      { id: 2, price_scaled: 100 },
      { id: 3, price_scaled: 99_999_990_000 },
    ]);

    // The 1e7-unit position is the case a float double-multiply would get
    // wrong: units × price is ~1e24, far past MAX_SAFE_INTEGER. valueOfUnits
    // does it in BigInt, so this has to be exact, not within a paisa.
    const huge = connection
      .prepare(
        `SELECT h.units_scaled AS u, v.price_scaled AS p
           FROM finance_investment_holdings h
           JOIN finance_investment_valuations v ON v.holding_id = h.id
          WHERE h.id = 5`,
      )
      .get() as { u: number; p: number };
    // 1e7 units at ₹99,999.99 = ₹9,99,999,90,00,000 — 99999990000000 paise, exactly.
    expect(valueOfUnits(huge.u, huge.p, "INR")).toBe(99_999_990_000_000);
  });

  it("records what it could not decide instead of guessing, and asks once", () => {
    // The only thing a test can assert about the currency of a pre-existing
    // foreign holding is that the migration *refuses to be confident*: an
    // unconfirmed INR on a dollar-priced holding is a silent 85x error that no
    // later code can detect.
    const connection = new Database(":memory:");
    connection.pragma("foreign_keys = ON");
    migrate(drizzle(connection), { migrationsFolder: migrationsUpTo(FOUNDATION_MIGRATION) });
    seedPreMigrationVault(connection);

    runFullJournal(connection);

    const currencyQuestions = connection
      .prepare(
        `SELECT subject_id FROM finance_reconciliation_items
          WHERE kind = 'currency_unconfirmed' ORDER BY subject_id`,
      )
      .all();
    // Holding 3 is the intl_equity one. The domestic equities are not queued:
    // for them INR is the right answer, not a guess.
    expect(currencyQuestions).toEqual([{ subject_id: 3 }]);

    // A valuation whose provenance is wholly unknown is surfaced too.
    expect(
      connection
        .prepare(
          `SELECT COUNT(*) AS n FROM finance_reconciliation_items
            WHERE kind = 'valuation_provenance_unknown'`,
        )
        .get(),
    ).toEqual({ n: 3 });

    // Replaying the journal must not re-ask a question, which is what the
    // (kind, subject) unique index is for.
    const before = connection
      .prepare("SELECT COUNT(*) AS n FROM finance_reconciliation_items")
      .get();
    migrate(drizzle(connection), { migrationsFolder: DRIZZLE });
    expect(
      connection.prepare("SELECT COUNT(*) AS n FROM finance_reconciliation_items").get(),
    ).toEqual(before);
  });
});
