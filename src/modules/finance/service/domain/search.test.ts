import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createAccount } from "./accounts";
import { searchFinance } from "./search";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("finance search", () => {
  it("matches an account name", () => {
    const account = createAccount({ name: "HDFC Savings", type: "savings" });

    const results = searchFinance("hdfc");

    expect(results).toEqual([
      {
        type: "account",
        id: account.id,
        label: "HDFC Savings",
        subtitle: "savings",
        href: "/finance/accounts",
      },
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    createAccount({ name: "HDFC Savings", type: "savings" });

    expect(searchFinance("no such thing")).toEqual([]);
  });

  it("returns an empty array for an empty or whitespace-only query", () => {
    createAccount({ name: "HDFC Savings", type: "savings" });

    expect(searchFinance("")).toEqual([]);
    expect(searchFinance("   ")).toEqual([]);
  });

  it("caps results per table at 5", () => {
    for (let i = 0; i < 7; i++) {
      createAccount({ name: `Matching Account ${i}`, type: "checking" });
    }

    expect(searchFinance("Matching")).toHaveLength(5);
  });
});
