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
      `INSERT INTO finance_accounts (id, name, type, opening_balance) VALUES
         (1, 'Savings', 'savings', 10000),
         (2, 'Brokerage', 'investment', 500000),
         (3, 'Home loan', 'loan', -2000000),
         (4, 'Amex', 'credit_card', -5000),
         (5, 'Owed by Raj', 'receivable', 25000)`,
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
      `INSERT INTO finance_investment_holdings (id, type, name, units) VALUES
         (1, 'equity', 'Acme Corp', 100),
         (2, 'govt_scheme', 'PPF', NULL),
         (3, 'intl_equity', 'Apple', 10)`,
    )
    .run();
  connection
    .prepare(
      "INSERT INTO finance_investment_valuations (id, holding_id, date, price_per_unit) VALUES (1, 1, '2024-06-30', 250.5)",
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
    ).toEqual({ n: 3 });

    // kind/normal_balance make the existing sign convention explicit. The stored
    // sign is untouched: the loan is still negative.
    expect(
      connection
        .prepare(
          "SELECT id, kind, normal_balance, liquidity, opening_balance FROM finance_accounts ORDER BY id",
        )
        .all(),
    ).toEqual([
      {
        id: 1,
        kind: "asset",
        normal_balance: "debit",
        liquidity: "liquid",
        opening_balance: 10000,
      },
      {
        id: 2,
        kind: "asset",
        normal_balance: "debit",
        liquidity: "semi_liquid",
        opening_balance: 500000,
      },
      {
        id: 3,
        kind: "liability",
        normal_balance: "credit",
        liquidity: "liquid",
        opening_balance: -2000000,
      },
      {
        id: 4,
        kind: "liability",
        normal_balance: "credit",
        liquidity: "liquid",
        opening_balance: -5000,
      },
      {
        id: 5,
        kind: "asset",
        normal_balance: "debit",
        liquidity: "illiquid",
        opening_balance: 25000,
      },
    ]);

    expect(
      connection.prepare("SELECT id, liquidity FROM finance_investment_holdings ORDER BY id").all(),
    ).toEqual([
      { id: 1, liquidity: "liquid" },
      { id: 2, liquidity: "illiquid" },
      { id: 3, liquidity: "liquid" },
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
});
