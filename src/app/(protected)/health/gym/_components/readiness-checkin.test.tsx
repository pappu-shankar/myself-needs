import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import type { ReadinessCheckin } from "@/modules/health";
import { ReadinessCheckinForm } from "./readiness-checkin";

describe("ReadinessCheckinForm", () => {
  it("renders five labelled 1-5 groups and passes axe", async () => {
    const { container } = render(<ReadinessCheckinForm date="2026-10-04" existing={null} />);
    expect(screen.getAllByRole("radio")).toHaveLength(25);
    expect(screen.getByRole("group", { name: /^Soreness.*1 = None, 5 = Very sore/ })).toBeTruthy();
    expect(screen.getByText("Very sore")).toBeTruthy();
    expectNoAxeViolations(await axe(container));
  });

  it("prefills from an existing check-in", () => {
    const existing = {
      date: "2026-10-04",
      sleepQuality: 4,
      energy: 3,
      soreness: 2,
      stress: 1,
      motivation: 5,
      note: "ok",
      createdAt: "",
    } as ReadinessCheckin;
    render(<ReadinessCheckinForm date="2026-10-04" existing={existing} />);
    const checked = screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked);
    expect(checked.map((r) => (r as HTMLInputElement).value).sort()).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(screen.getByRole("button", { name: "Update check-in" })).toBeTruthy();
  });
});
