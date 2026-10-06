import { afterEach, beforeEach, describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createAccount } from "@/modules/finance/service/domain/accounts";
import { createCategory } from "@/modules/finance/service/domain/categories";
import { createTransaction } from "@/modules/finance/service/domain/transactions";
import FinancePage from "./page";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("finance page accessibility", () => {
  it("has no violations in the empty state", async () => {
    const { container } = render(<FinancePage />);
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations with accounts and transactions populated", async () => {
    const checking = createAccount({
      name: "Checking",
      type: "checking",
      openingBalanceMinor: 500_000,
    });
    const groceries = createCategory({ name: "Groceries", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 12_000,
      date: "2026-08-24",
    });

    const { container } = render(<FinancePage />);
    expectNoAxeViolations(await axe(container));
  });
});
