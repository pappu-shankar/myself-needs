import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import type { WorkoutSet } from "@/modules/health";
import type { ExerciseSession } from "@/modules/health/engine/types";
import { SetList } from "./set-row";

function set(id: number, patch: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    workoutExerciseId: 1,
    position: id,
    kind: "working",
    weightKg: 100,
    reps: 5,
    durationSec: null,
    distanceKm: null,
    rir: null,
    rpe: null,
    completed: false,
    completedAt: null,
    trackedBy: "manual",
    romScore: null,
    ...patch,
  };
}

const previous: ExerciseSession = {
  workoutId: 7,
  date: "2026-10-01",
  target: null,
  sets: [
    {
      kind: "working",
      weightKg: 97.5,
      reps: 5,
      durationSec: null,
      distanceKm: null,
      rir: 2,
      rpe: null,
      completed: true,
    },
    {
      kind: "working",
      weightKg: 97.5,
      reps: 4,
      durationSec: null,
      distanceKm: null,
      rir: 1,
      rpe: null,
      completed: true,
    },
  ],
};

function renderList(sets: WorkoutSet[]) {
  const handlers = {
    onSave: vi.fn().mockResolvedValue({ ok: true }),
    onComplete: vi.fn().mockResolvedValue({ ok: true }),
    onUncomplete: vi.fn(),
    onDelete: vi.fn(),
    onPlates: vi.fn(),
  };
  const view = render(
    <SetList
      entry={{ id: 1, mode: "reps", isBodyweight: false, sets }}
      effortScale="rir"
      previousSession={previous}
      errors={{ "set:2": "That set no longer exists." }}
      {...handlers}
    />,
  );
  return { ...view, handlers };
}

describe("SetList", () => {
  it("has no accessibility violations with done, open, warm-up and errored rows", async () => {
    const { container } = renderList([
      set(1, { kind: "warmup", weightKg: 40, completed: true }),
      set(2, { completed: true, trackedBy: "camera", romScore: 88 }),
      set(3, { kind: "amrap", weightKg: null, reps: null }),
    ]);
    expectNoAxeViolations(await axe(container));
    expect(screen.getByLabelText("Set 1 weight in kg")).toHaveValue("100");
    expect(screen.getByRole("button", { name: "Set 1 done" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Last: 97.5 × 4")).toBeInTheDocument();
  });

  it("saves a typed value on blur, not while typing", () => {
    const { handlers } = renderList([set(5)]);
    const reps = screen.getByLabelText("Set 1 reps");
    fireEvent.change(reps, { target: { value: "6" } });
    expect(handlers.onSave).not.toHaveBeenCalled();
    fireEvent.blur(reps);
    expect(handlers.onSave).toHaveBeenCalledWith(5, { reps: 6 });
  });

  it("completes with last session's values when a field is left empty", () => {
    const { handlers } = renderList([set(5, { weightKg: null, reps: null })]);
    fireEvent.change(screen.getByLabelText("Set 1 reps"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Set 1 done" }));
    expect(handlers.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), {
      weightKg: 97.5,
      reps: 5,
    });
  });

  it("shows and takes pounds, but never nudges an untouched stored kg", () => {
    const onComplete = vi.fn().mockResolvedValue({ ok: true });
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(
      <SetList
        entry={{ id: 1, mode: "reps", isBodyweight: false, sets: [set(5), set(6)] }}
        effortScale="none"
        weightUnit="lb"
        previousSession={previous}
        errors={{}}
        onSave={onSave}
        onComplete={onComplete}
        onUncomplete={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const weight = screen.getByLabelText("Set 1 weight in lb");
    expect(weight).toHaveValue("220.5");
    expect(screen.getByText("Last: 215 × 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set 1 done" }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), {
      weightKg: 100,
      reps: 5,
    });
    // Retyping the shown value isn't a change; a new value is saved in kg.
    fireEvent.change(weight, { target: { value: "220.5" } });
    fireEvent.blur(weight);
    expect(onSave).not.toHaveBeenCalled();
    const second = screen.getByLabelText("Set 2 weight in lb");
    fireEvent.change(second, { target: { value: "225" } });
    fireEvent.blur(second);
    expect(onSave).toHaveBeenCalledWith(6, { weightKg: 102.058 });
  });

  it("shows speed and pace on a done cardio set", () => {
    render(
      <SetList
        entry={{
          id: 1,
          mode: "cardio",
          isBodyweight: false,
          sets: [
            set(5, {
              weightKg: null,
              reps: null,
              durationSec: 1500,
              distanceKm: 5,
              completed: true,
            }),
          ],
        }}
        effortScale="none"
        errors={{}}
        onSave={vi.fn()}
        onComplete={vi.fn()}
        onUncomplete={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("12 km/h · 5:00 /km")).toBeInTheDocument();
  });

  it("refuses to log a set without reps and says why", () => {
    const onComplete = vi.fn();
    render(
      <SetList
        entry={{ id: 1, mode: "reps", isBodyweight: false, sets: [set(5, { reps: null })] }}
        effortScale="none"
        errors={{}}
        onSave={vi.fn()}
        onComplete={onComplete}
        onUncomplete={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set 1 done" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the reps you did first.");
    expect(screen.getByLabelText("Set 1 reps")).toHaveAttribute("aria-invalid", "true");
    expect(onComplete).not.toHaveBeenCalled();
  });
});
