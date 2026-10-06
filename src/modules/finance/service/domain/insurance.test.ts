import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createInsurancePolicy, getInsurancePolicies } from "./insurance";

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
