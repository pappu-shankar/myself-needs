import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { addDays } from "@/lib/dates";
import { ActivityHeatmap, type HeatmapDay } from "./activity-heatmap";

// 2026-08-31 is a Monday; 8 weeks.
function makeDays(): HeatmapDay[] {
  return Array.from({ length: 56 }, (_, i) => {
    const date = addDays("2026-08-31", i);
    const trained = i === 3 || i === 20;
    return {
      date,
      minutes: trained ? 65 : 0,
      sessions: trained ? 1 : 0,
      level: (trained ? 3 : 0) as 0 | 3,
    };
  });
}

describe("ActivityHeatmap", () => {
  it("renders a 7-row grid of weeks with month labels and tooltips", () => {
    render(<ActivityHeatmap title="Activity" days={makeDays()} />);
    expect(screen.getAllByTestId("heatmap-cell")).toHaveLength(56);
    expect(screen.getAllByTestId("month-label")).toHaveLength(8);
    const labels = screen.getAllByTestId("month-label").map((e) => e.textContent);
    // Week 0 holds a single August day; its label would collide with September's
    // one column later, so it gives way to the full month.
    expect(labels.filter(Boolean)).toEqual(["Sep", "Oct"]);
    expect(screen.getByTitle("Thu 3 Sep 2026 — 1 session, 65 min")).toBeTruthy();
    expect(screen.getByText(/2 sessions · 2\.2 h · 2 active days/)).toBeTruthy();
  });

  it("toggles to a table of non-empty days only", () => {
    render(<ActivityHeatmap title="Activity" days={makeDays()} />);
    fireEvent.click(screen.getByRole("button", { name: "View as table" }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("has no axe violations", async () => {
    const { container } = render(<ActivityHeatmap title="Activity" days={makeDays()} />);
    expectNoAxeViolations(await axe(container));
  });
});
