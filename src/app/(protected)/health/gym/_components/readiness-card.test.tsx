import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import type { ReadinessOverview } from "@/modules/health";
import { ReadinessCard } from "./readiness-card";

const base: ReadinessOverview = {
  date: "2026-10-04",
  score: 82,
  band: "push",
  recommendation: "Good day to push — go for PRs",
  factors: [
    { label: "Sleep", detail: "8 h slept, target 8 h — 100/100", impact: "positive" },
    { label: "Check-in", detail: "No check-in today — left out of the score", impact: "neutral" },
    { label: "Training load", detail: "Ratio 1.6, above 1.5", impact: "negative" },
  ],
  sleepHours: 7.5,
  sleepTargetHours: 8,
  checkin: null,
  acwr: 1.6,
};

describe("ReadinessCard", () => {
  it("shows score, band, recommendation, factors and sleep", async () => {
    const { container } = render(<ReadinessCard readiness={base} />);
    expect(screen.getByText("82")).toBeTruthy();
    expect(screen.getByText("Push")).toBeTruthy();
    expect(screen.getByText(/Good day to push/)).toBeTruthy();
    expect(screen.getByLabelText("Lowers readiness")).toBeTruthy();
    expect(screen.getByText(/7\.5 h of 8 h target/)).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Sleep against target" })).toBeTruthy();
    expectNoAxeViolations(await axe(container));
  });

  it("shows an empty state with no score", async () => {
    const { container } = render(
      <ReadinessCard
        readiness={{ ...base, score: null, band: null, sleepHours: null, factors: [] }}
      />,
    );
    expect(screen.getByTestId("readiness-empty").textContent).toMatch(/check-in/);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expectNoAxeViolations(await axe(container));
  });
});
