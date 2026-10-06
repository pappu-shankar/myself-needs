import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { SessionPreview, formatPlannedSet, type PreviewEntry } from "./session-preview";

const entries: PreviewEntry[] = [
  {
    id: 1,
    name: "Back Squat",
    mode: "reps",
    isBodyweight: false,
    reason: "Last time you hit every rep, so the weight goes up 2.5 kg.",
    sets: [
      { kind: "warmup", weightKg: 40, reps: 5, durationSec: null, distanceKm: null },
      { kind: "working", weightKg: 100, reps: 5, durationSec: null, distanceKm: null },
      { kind: "amrap", weightKg: 100, reps: 5, durationSec: null, distanceKm: null },
    ],
  },
  {
    id: 2,
    name: "Plank",
    mode: "time",
    isBodyweight: false,
    reason: "First time — start light.",
    sets: [{ kind: "working", weightKg: null, reps: null, durationSec: 45, distanceKm: null }],
  },
];

describe("formatPlannedSet", () => {
  it("formats loads in pounds", () => {
    const set = {
      kind: "working" as const,
      weightKg: 102.058,
      reps: 5,
      durationSec: null,
      distanceKm: null,
    };
    expect(formatPlannedSet(set, "reps", false, "lb")).toBe("225 lb × 5");
  });

  it("formats reps, timed and cardio sets", () => {
    expect(formatPlannedSet(entries[0].sets[1], "reps")).toBe("100 kg × 5");
    expect(formatPlannedSet(entries[1].sets[0], "time")).toBe("0:45");
    expect(formatPlannedSet({ ...entries[0].sets[1], weightKg: null }, "reps")).toBe("5 reps");
    expect(formatPlannedSet({ ...entries[0].sets[1], weightKg: 10 }, "reps", true)).toBe(
      "+10 kg × 5",
    );
    expect(
      formatPlannedSet(
        { kind: "working", weightKg: null, reps: null, durationSec: 1200, distanceKm: 3 },
        "cardio",
      ),
    ).toBe("20:00 · 3 km");
  });
});

describe("SessionPreview", () => {
  it("shows sets, badges and the reason", () => {
    render(<SessionPreview entries={entries} />);
    expect(screen.getByText("Back Squat")).toBeTruthy();
    expect(screen.getByText("AMRAP")).toBeTruthy();
    expect(screen.getByText(/weight goes up/)).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<SessionPreview entries={entries} />);
    expectNoAxeViolations(await axe(container));
  });
});
