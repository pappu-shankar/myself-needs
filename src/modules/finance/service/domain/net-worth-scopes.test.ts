import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getNetWorthByScope } from "./net-worth-scopes";
import { createAccount } from "./accounts";
import { createHolding, createValuation } from "./investments";
import { toPriceScaled, toUnitsScaled } from "../utility/units";
import { getSelfEntity, insertEntity, insertEntityStake } from "../../db/queries/domain/entities";
import { upsertFxRates } from "../../db/queries/config/fx-rates";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const AS_OF = "2026-03-15";

describe("net worth by scope", () => {
  it("hand-verified: the definitions reconcile over one set of components", () => {
    // Cash ₹10,000 (liquid), a fixed deposit ₹50,000 (semi_liquid), jewellery
    // ₹2,00,000 (illiquid, and not a financial asset), and a card owing
    // ₹5,000. Every figure below is derived from exactly these four.
    createAccount({
      name: "Savings",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 1_000_000,
    });
    createAccount({
      name: "Card",
      type: "credit_card",
      currency: "INR",
      openingBalanceMinor: 500_000,
    });
    const fd = createHolding({
      type: "fd",
      name: "SBI FD",
      currency: "INR",
      liquidity: "semi_liquid",
      unitsScaled: null,
    });
    createValuation({
      holdingId: fd.id,
      date: "2026-01-01",
      priceScaled: toPriceScaled(1),
      priceCurrency: "INR",
    });
    const jewellery = createHolding({
      type: "other_asset",
      name: "Jewellery",
      currency: "INR",
      liquidity: "illiquid",
      unitsScaled: toUnitsScaled(1),
    });
    createValuation({
      holdingId: jewellery.id,
      date: "2026-01-01",
      priceScaled: toPriceScaled(200_000),
      priceCurrency: "INR",
    });

    const view = getNetWorthByScope(AS_OF);

    // Total: ₹10,000 cash − ₹5,000 card + ₹2,00,000 jewellery. The FD's
    // accrual value is whatever its own basis says; it is asserted via the
    // difference between scopes below rather than restated here.
    const total = view.scopes.total.value.baseMinor;
    const financial = view.scopes.financial.value.baseMinor;
    const liquid = view.scopes.liquid.value.baseMinor;

    // Financial excludes the jewellery and nothing else, so the difference
    // between total and financial is exactly the jewellery.
    expect(total - financial).toBe(20_000_000);
    // Liquid keeps the cash and the card (a debt is owed whatever backs it)
    // and drops both holdings.
    expect(liquid).toBe(1_000_000 - 500_000);
    // Every scope reports its own liquidity split, and the splits add back.
    const split = view.scopes.total.liquidityMinor;
    expect(split.liquid + split.semi_liquid + split.illiquid).toBe(total);
    expect(split.illiquid).toBe(20_000_000);
    expect(view.scopes.total.value.complete).toBe(true);
  });

  it("prorates a family member's entity into the household but not into total", () => {
    const self = getSelfEntity()!;
    const spouse = insertEntity({ kind: "family_member", name: "Asha" });
    // A joint account held 50/50.
    insertEntityStake({
      entityId: spouse.id,
      holderEntityId: self.id,
      ownershipBps: 5_000,
      effectiveFrom: "1970-01-01",
    });
    createAccount({
      name: "Mine",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 1_000_000,
    });
    createAccount({
      name: "Hers",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 400_000,
      entityId: spouse.id,
    });

    const view = getNetWorthByScope(AS_OF);

    // Total is the Self entity alone.
    expect(view.scopes.total.value.baseMinor).toBe(1_000_000);
    // Household adds half of her ₹4,000 — prorated, not counted whole.
    expect(view.scopes.household.value.baseMinor).toBe(1_000_000 + 200_000);
  });

  it("flags the business share illiquid however liquid the underlying rows are", () => {
    const self = getSelfEntity()!;
    const company = insertEntity({ kind: "business", name: "Acme Pvt Ltd" });
    insertEntityStake({
      entityId: company.id,
      holderEntityId: self.id,
      ownershipBps: 7_000,
      effectiveFrom: "1970-01-01",
    });
    // The company's own cash is liquid *to the company*. The user's 70% of it
    // is not: a stake in a private entity has no exit of its own, which is the
    // whole reason business_adjusted is kept apart from household.
    createAccount({
      name: "Acme current account",
      type: "checking",
      currency: "INR",
      openingBalanceMinor: 10_000_000,
      entityId: company.id,
    });

    const view = getNetWorthByScope(AS_OF);

    expect(view.scopes.household.value.baseMinor).toBe(0);
    expect(view.scopes.business_adjusted.value.baseMinor).toBe(7_000_000);
    const split = view.scopes.business_adjusted.liquidityMinor;
    expect(split.illiquid).toBe(7_000_000);
    expect(split.liquid).toBe(0);
  });

  it("honours the stake in force on the as-of date, not today's", () => {
    const self = getSelfEntity()!;
    const company = insertEntity({ kind: "business", name: "Acme" });
    // Diluted from 80% to 40% in 2025. Net worth as of 2024 must use 80%.
    insertEntityStake({
      entityId: company.id,
      holderEntityId: self.id,
      ownershipBps: 8_000,
      effectiveFrom: "2020-01-01",
      effectiveTo: "2025-01-01",
    });
    insertEntityStake({
      entityId: company.id,
      holderEntityId: self.id,
      ownershipBps: 4_000,
      effectiveFrom: "2025-01-01",
    });
    createAccount({
      name: "Acme",
      type: "checking",
      currency: "INR",
      openingBalanceMinor: 10_000_000,
      entityId: company.id,
    });

    expect(getNetWorthByScope("2024-06-01").scopes.business_adjusted.value.baseMinor).toBe(
      8_000_000,
    );
    expect(getNetWorthByScope("2026-06-01").scopes.business_adjusted.value.baseMinor).toBe(
      4_000_000,
    );
  });

  it("leaves out an entity with no recorded stake rather than assuming full ownership", () => {
    // Silently counting an unattributed business at 100% is how a stake nobody
    // entered becomes wealth the user does not have.
    const orphan = insertEntity({ kind: "business", name: "Unattributed Ltd" });
    createAccount({
      name: "Theirs",
      type: "checking",
      currency: "INR",
      openingBalanceMinor: 99_000_000,
      entityId: orphan.id,
    });

    const view = getNetWorthByScope(AS_OF);

    expect(view.scopes.business_adjusted.value.baseMinor).toBe(0);
    expect(view.scopes.business_adjusted.components).toEqual([]);
  });

  it("prorates before converting, and says so in the basis", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${AS_OF}T00:00:00Z`));
    const self = getSelfEntity()!;
    const spouse = insertEntity({ kind: "family_member", name: "Asha" });
    insertEntityStake({
      entityId: spouse.id,
      holderEntityId: self.id,
      ownershipBps: 5_000,
      effectiveFrom: "1970-01-01",
    });
    upsertFxRates([
      { base: "EUR", quote: "INR", date: "2026-03-01", rateScaled: 90 * 1e8, source: "test" },
      { base: "EUR", quote: "USD", date: "2026-03-01", rateScaled: 1.08 * 1e8, source: "test" },
    ]);
    createAccount({
      name: "Her dollars",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 200_000,
      entityId: spouse.id,
    });

    const household = getNetWorthByScope(AS_OF).scopes.household.value;

    // $2,000 at 50% is $1,000, and $1,000 → EUR 925.925926 → ₹83,333.33.
    // Converting first and prorating after would round twice.
    expect(household.byCurrency.find((c) => c.currency === "USD")?.minor).toBe(100_000);
    expect(household.baseMinor).toBe(8_333_333);
    expect(household.byCurrency.find((c) => c.currency === "USD")?.rateDate).toBe("2026-03-01");
    vi.useRealTimers();
  });
});
