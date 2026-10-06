// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { attachDatabase, closeDatabase } from "@/modules/core/db/client";
import { getAccountBalanceMinor, listAccountsWithBalances } from "./queries/domain/accounts";

const MONEY_MIGRATION = "0023_common_albert_cleary";
const tmp = path.join(process.cwd(), ".vitest-tmp", randomUUID());

afterEach(() => {
  closeDatabase();
  rmSync(tmp, { recursive: true, force: true });
});

function migrationsUpTo(tagExclusive: string): string {
  const dir = path.join(tmp, "before");
  cpSync(path.join(process.cwd(), "drizzle"), dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const cut = journal.entries.findIndex((e: { tag: string }) => e.tag === tagExclusive);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

describe("REAL rupees → INTEGER paise migration", () => {
  it("converts existing amounts exactly and keeps balances right", () => {
    const connection = new Database(":memory:");
    connection.pragma("foreign_keys = ON");
    migrate(drizzle(connection), { migrationsFolder: migrationsUpTo(MONEY_MIGRATION) });

    connection
      .prepare(
        "INSERT INTO finance_accounts (id, name, type, opening_balance, credit_limit) VALUES (1, 'Cash', 'cash', 0.3, NULL), (2, 'Bank', 'savings', 1234.56, NULL), (3, 'Card', 'credit_card', 0, 50000.1)",
      )
      .run();
    const insertTx = connection.prepare(
      "INSERT INTO finance_transactions (type, account_id, to_account_id, amount, date) VALUES (?, ?, ?, ?, ?)",
    );
    insertTx.run("expense", 1, null, 0.1, "2026-01-01");
    insertTx.run("expense", 1, null, 0.2, "2026-01-02");
    insertTx.run("transfer", 2, 1, 99.99, "2026-01-03");
    connection
      .prepare("INSERT INTO finance_categories (id, name, type) VALUES (1, 'Food', 'expense')")
      .run();
    const insertBudget = connection.prepare(
      "INSERT INTO finance_budgets (id, category_id, monthly_limit, effective_from) VALUES (?, 1, ?, '2026-01-01')",
    );
    insertBudget.run(1, 5000);
    insertBudget.run(2, 6000.5);

    // Same as openDatabase: foreign keys off during the table rebuilds, verified after.
    connection.pragma("foreign_keys = OFF");
    migrate(drizzle(connection), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    connection.pragma("foreign_keys = ON");

    const raw = connection
      .prepare("SELECT id, opening_balance_minor FROM finance_accounts ORDER BY id")
      .all();
    expect(raw).toEqual([
      { id: 1, opening_balance_minor: 30 },
      { id: 2, opening_balance_minor: 123456 },
      { id: 3, opening_balance_minor: 0 },
    ]);
    // The credit limit left the account row for the credit-terms satellite, still exact.
    expect(
      connection.prepare("SELECT account_id, credit_limit_minor FROM finance_credit_terms").all(),
    ).toEqual([{ account_id: 3, credit_limit_minor: 5000010 }]);
    const amounts = connection
      .prepare("SELECT amount_minor AS amount, typeof(amount_minor) AS t FROM finance_transactions ORDER BY id")
      .all();
    expect(amounts).toEqual([
      { amount: 10, t: "integer" },
      { amount: 20, t: "integer" },
      { amount: 9999, t: "integer" },
    ]);

    // Duplicate budgets (same category + start) collapse to the newest instead of failing the upgrade.
    expect(connection.prepare("SELECT id, monthly_limit_minor FROM finance_budgets").all()).toEqual([
      { id: 2, monthly_limit_minor: 600050 },
    ]);

    attachDatabase(connection);
    // 0.30 − 0.10 − 0.20 + 99.99: exactly 99.99, never 99.98999999 or −2.8e-17.
    expect(getAccountBalanceMinor(1)).toBe(9999);
    expect(getAccountBalanceMinor(2)).toBe(113457);
    expect(listAccountsWithBalances().map((a) => a.balanceMinor)).toEqual([113457, 0, 9999]);
    expect(connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
