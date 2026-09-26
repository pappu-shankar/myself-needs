import { afterEach, beforeEach, describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createAccount } from "@/modules/finance/service/domain/accounts";
import { createMetric } from "@/modules/health/service/metrics";
import { createMedication } from "@/modules/mental/service";
import { createGoal } from "@/modules/plans/service";
import DashboardPage from "./page";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("dashboard page accessibility", () => {
  it("has no violations in the empty state", async () => {
    const { container } = render(<DashboardPage />);
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations once every module has data", async () => {
    createAccount({ name: "Checking", type: "checking", openingBalance: 1000 });
    createMetric({ type: "weight", label: "Weight", value: 70, unit: "kg", date: "2026-08-24" });
    createMedication({ name: "Sertraline", startDate: "2026-08-01" });
    createGoal({
      name: "Emergency fund",
      type: "other",
      priority: "must_have",
      progressPercent: 20,
    });

    const { container } = render(<DashboardPage />);
    expectNoAxeViolations(await axe(container));
  });
});
