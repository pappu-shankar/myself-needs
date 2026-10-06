import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { WorkoutList } from "./workout-list";
import { SessionPreview } from "../workout/session-preview";

describe("WorkoutList", () => {
  it("has no accessibility violations and links each workout", async () => {
    const { container } = render(
      <WorkoutList
        rows={[
          {
            id: 12,
            name: "Push A",
            date: "2026-10-03",
            durationMin: 65,
            setsCompleted: 18,
            tonnageKg: 8450,
            exerciseCount: 5,
          },
          {
            id: 11,
            name: "Quick workout",
            date: "2026-10-01",
            durationMin: 20,
            setsCompleted: 1,
            tonnageKg: 0,
            exerciseCount: 1,
          },
        ]}
      />,
    );
    expectNoAxeViolations(await axe(container));
    expect(screen.getByRole("link", { name: /Push A/ })).toHaveAttribute(
      "href",
      "/health/gym/history/12",
    );
    expect(screen.getByText("1 h 05 min")).toBeInTheDocument();
    expect(screen.getByText("1 set")).toBeInTheDocument();
  });
});

describe("SessionPreview", () => {
  it("has no accessibility violations and shows sets with their reasons", async () => {
    const { container } = render(
      <SessionPreview
        plan={{
          routineName: "Upper A",
          programLabel: "Hypertrophy block: week 2 of 5",
          entries: [
            {
              id: 1,
              name: "barbell bench press",
              mode: "reps",
              isBodyweight: false,
              perSide: false,
              supersetGroup: null,
              sets: [1, 2, 3].map(() => ({
                kind: "working" as const,
                weightKg: 82.5,
                reps: 5,
                durationSec: null,
                distanceKm: null,
              })),
              restSec: 150,
              reason: "All reps hit last time — +2.5 kg.",
            },
            {
              id: 2,
              name: "plank",
              mode: "time",
              isBodyweight: true,
              perSide: false,
              supersetGroup: 1,
              sets: [
                { kind: "working", weightKg: null, reps: null, durationSec: 45, distanceKm: null },
              ],
              restSec: 60,
              reason: "First session — targets as written.",
            },
          ],
        }}
      />,
    );
    expectNoAxeViolations(await axe(container));
    expect(screen.getByText("3 × 5 @ 82.5 kg")).toBeInTheDocument();
    expect(screen.getByText("All reps hit last time — +2.5 kg.")).toBeInTheDocument();
  });
});
