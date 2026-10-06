import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import {
  archiveInsurancePolicyById,
  createInsurancePolicy,
  deleteInsurancePolicyById,
  editInsurancePolicy,
  getInsurancePolicies,
  getInsurancePolicy,
  unarchiveInsurancePolicyById,
} from "./insurance";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createRecurringRule } from "./recurring";
import { createTransaction, getTransaction } from "./transactions";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("insurance service", () => {
  it("creates an insurance policy and returns the persisted row", () => {
    const policy = createInsurancePolicy({
      type: "health",
      provider: "Acme Insurance",
      name: "Family Floater",
      premiumAmountMinor: 1500000,
      premiumFrequency: "yearly",
      startDate: "2026-01-01",
      renewalDate: "2027-01-01",
      is80dEligible: true,
    });

    expect(policy).toMatchObject({
      type: "health",
      provider: "Acme Insurance",
      name: "Family Floater",
      premiumAmountMinor: 1500000,
      is80dEligible: true,
      is80cEligible: false,
    });
  });

  it("lists policies ordered by renewal date ascending", () => {
    createInsurancePolicy({
      type: "life",
      provider: "Acme",
      name: "Term Plan",
      premiumAmountMinor: 1200000,
      premiumFrequency: "yearly",
      startDate: "2020-01-01",
      renewalDate: "2027-06-01",
    });
    createInsurancePolicy({
      type: "vehicle",
      provider: "Acme",
      name: "Car Insurance",
      premiumAmountMinor: 500000,
      premiumFrequency: "yearly",
      startDate: "2025-01-01",
      renewalDate: "2026-09-01",
    });

    const policies = getInsurancePolicies();

    expect(policies.map((p) => p.name)).toEqual(["Car Insurance", "Term Plan"]);
  });
});

const BASE_POLICY = {
  type: "health",
  provider: "Acme Insurance",
  name: "Family Floater",
  currency: "INR",
  premiumAmountMinor: 1_500_000,
  premiumFrequency: "yearly",
  startDate: "2026-01-01",
} as const;

describe("createInsurancePolicy validation", () => {
  it("rejects a premium that isn't whole minor units above zero", () => {
    expect(() => createInsurancePolicy({ ...BASE_POLICY, premiumAmountMinor: 0 })).toThrow(
      /whole number of minor units above zero/,
    );
    expect(() => createInsurancePolicy({ ...BASE_POLICY, premiumAmountMinor: 1500.5 })).toThrow(
      /whole number of minor units above zero/,
    );
  });

  it("rejects a renewal date before the start date", () => {
    expect(() => createInsurancePolicy({ ...BASE_POLICY, renewalDate: "2025-12-31" })).toThrow(
      /renewal date can't be before it started/,
    );
  });
});

describe("editInsurancePolicy", () => {
  it("edits in place rather than producing a second policy", () => {
    const policy = createInsurancePolicy({ ...BASE_POLICY, name: "Famly Floater" });

    const edited = editInsurancePolicy(policy.id, { name: "Family Floater" });

    expect(edited.id).toBe(policy.id);
    expect(getInsurancePolicies()).toHaveLength(1);
    expect(getInsurancePolicy(policy.id)!.name).toBe("Family Floater");
  });

  it("throws when the policy is missing", () => {
    expect(() => editInsurancePolicy(999, { name: "Nope" })).toThrow(/no longer exists/);
  });

  it("re-runs the create-time validation on the merged row", () => {
    const policy = createInsurancePolicy({ ...BASE_POLICY, renewalDate: "2027-01-01" });

    expect(() => editInsurancePolicy(policy.id, { premiumAmountMinor: -1 })).toThrow(
      /whole number of minor units above zero/,
    );
    // The renewal check sees the *stored* start date, not just the patch.
    expect(() => editInsurancePolicy(policy.id, { renewalDate: "2025-06-01" })).toThrow(
      /renewal date can't be before it started/,
    );
    // And the stored renewal date, not just the patched start date.
    expect(() => editInsurancePolicy(policy.id, { startDate: "2028-01-01" })).toThrow(
      /renewal date can't be before it started/,
    );
  });

  it("allows a currency change while no premium has been logged", () => {
    const policy = createInsurancePolicy(BASE_POLICY);

    expect(editInsurancePolicy(policy.id, { currency: "USD" }).currency).toBe("USD");
  });

  it("refuses a currency change once a premium has been logged under the policy", () => {
    const { policy } = seedPolicyWithLoggedPremium();

    expect(() => editInsurancePolicy(policy.id, { currency: "USD" })).toThrow(
      /currency can't be changed/,
    );
    expect(getInsurancePolicy(policy.id)!.currency).toBe("INR");
  });
});

/** A policy whose premium rule has one confirmed transaction behind it —
 * the only way anything references a policy, since the FK runs the other way. */
function seedPolicyWithLoggedPremium() {
  const account = createAccount({ name: "Checking", type: "checking", currency: "INR" });
  const category = createCategory({ name: "Insurance", type: "expense" });
  const rule = createRecurringRule({
    type: "expense",
    accountId: account.id,
    categoryId: category.id,
    amountMinor: 1_500_000,
    currency: "INR",
    frequency: "yearly",
    startDate: "2026-01-01",
  });
  const policy = createInsurancePolicy({ ...BASE_POLICY, recurringRuleId: rule.id });
  const transaction = createTransaction({
    type: "expense",
    accountId: account.id,
    categoryId: category.id,
    amountMinor: 1_500_000,
    date: "2026-01-02",
    recurringRuleId: rule.id,
    periodStart: "2026-01-01",
  });
  return { policy, rule, transaction };
}

describe("archiveInsurancePolicyById", () => {
  it("hides the policy from listings while the premium history stays intact", () => {
    const { policy, transaction } = seedPolicyWithLoggedPremium();

    archiveInsurancePolicyById(policy.id);

    expect(getInsurancePolicies()).toHaveLength(0);
    expect(getInsurancePolicies({ includeArchived: true }).map((p) => p.id)).toEqual([policy.id]);
    // The premium transaction is untouched — archiving is not a restatement.
    expect(getTransaction(transaction.id)).not.toBeNull();
    expect(getTransaction(transaction.id)!.amountMinor).toBe(1_500_000);
  });

  it("round-trips through unarchive", () => {
    const policy = createInsurancePolicy(BASE_POLICY);

    expect(archiveInsurancePolicyById(policy.id).archivedAt).not.toBeNull();
    expect(getInsurancePolicies()).toHaveLength(0);

    expect(unarchiveInsurancePolicyById(policy.id).archivedAt).toBeNull();
    expect(getInsurancePolicies()).toHaveLength(1);
  });

  it("throws when the policy is missing", () => {
    expect(() => archiveInsurancePolicyById(999)).toThrow(/no longer exists/);
    expect(() => unarchiveInsurancePolicyById(999)).toThrow(/no longer exists/);
  });
});

describe("deleteInsurancePolicyById", () => {
  it("deletes a policy with no premium history", () => {
    const policy = createInsurancePolicy(BASE_POLICY);

    deleteInsurancePolicyById(policy.id);

    expect(getInsurancePolicy(policy.id)).toBeNull();
  });

  it("deletes a policy whose linked rule has not been confirmed yet", () => {
    const account = createAccount({ name: "Checking", type: "checking", currency: "INR" });
    const category = createCategory({ name: "Insurance", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 1_500_000,
      currency: "INR",
      frequency: "yearly",
      startDate: "2026-01-01",
    });
    const policy = createInsurancePolicy({ ...BASE_POLICY, recurringRuleId: rule.id });

    deleteInsurancePolicyById(policy.id);
    expect(getInsurancePolicy(policy.id)).toBeNull();
  });

  it("refuses to delete a policy once a premium has been logged, and names archiving instead", () => {
    const { policy } = seedPolicyWithLoggedPremium();

    expect(() => deleteInsurancePolicyById(policy.id)).toThrow(/Archive it instead/);
    expect(getInsurancePolicy(policy.id)).not.toBeNull();
  });

  it("refuses to delete a policy a voided premium still explains", () => {
    const { policy, transaction } = seedPolicyWithLoggedPremium();
    getDb().run(
      sql`UPDATE finance_transactions SET voided_at = '2026-01-03', void_reason = 'typo' WHERE id = ${transaction.id}`,
    );

    expect(() => deleteInsurancePolicyById(policy.id)).toThrow(/can't be deleted/);
  });

  it("throws when the policy is missing", () => {
    expect(() => deleteInsurancePolicyById(999)).toThrow(/no longer exists/);
  });
});
