import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT, parseBackup, splitBackup, type GymBackupV1 } from "./backup";
import { ImportFormatError } from "./validate";
import type { ImportedWorkout } from "./types";

const workout = (i: number): ImportedWorkout => ({
  ref: `strong:2024-05-${String(i + 1).padStart(2, "0")}T07:30:00:Push`,
  date: `2024-05-${String(i + 1).padStart(2, "0")}`,
  startedAt: `2024-05-${String(i + 1).padStart(2, "0")}T07:30:00`,
  finishedAt: null,
  name: "Push",
  notes: null,
  exercises: [
    {
      name: "Bench Press (Barbell)",
      notes: null,
      sets: [
        {
          kind: "working",
          weightKg: 60,
          reps: 8,
          durationSec: null,
          distanceKm: null,
          rpe: 8,
          rir: null,
        },
      ],
    },
  ],
});

const backup = (workouts = 3): GymBackupV1 => ({
  format: BACKUP_FORMAT,
  version: 1,
  exportedAt: "2024-06-01T00:00:00.000Z",
  customExercises: [],
  routines: [],
  week: {},
  workouts: Array.from({ length: workouts }, (_, i) => workout(i)),
  weighIns: [{ date: "2024-05-01", weightKg: 80.5 }],
  measurements: [{ date: "2024-05-01", site: "waist", value: 82, note: null }],
  readiness: [
    {
      date: "2024-05-01",
      sleepQuality: 4,
      energy: 3,
      soreness: 2,
      stress: 2,
      motivation: 5,
      note: null,
    },
  ],
  settings: null,
});

describe("parseBackup", () => {
  it("round-trips a valid backup", () => {
    const b = backup();
    expect(parseBackup(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it("tolerates missing optional lists", () => {
    const parsed = parseBackup({ format: BACKUP_FORMAT, version: 1 });
    expect(parsed.workouts).toEqual([]);
    expect(parsed.settings).toBeNull();
  });

  it("rejects bad data with a path", () => {
    const run = (mutate: (b: Record<string, unknown>) => void) => {
      const b = JSON.parse(JSON.stringify(backup())) as Record<string, unknown>;
      mutate(b);
      try {
        parseBackup(b);
      } catch (e) {
        expect(e).toBeInstanceOf(ImportFormatError);
        return (e as Error).message;
      }
      return null;
    };
    expect(run((b) => (b.format = "x"))).toMatch(/isn't a Personal Life OS gym backup/);
    expect(run((b) => ((b.workouts as ImportedWorkout[])[1].date = "2024-02-31"))).toMatch(
      /workouts\[1\]\.date/,
    );
    expect(run((b) => ((b.measurements as { site: string }[])[0].site = "elbow"))).toMatch(
      /measurements\[0\]\.site/,
    );
    expect(run((b) => ((b.readiness as { energy: number }[])[0].energy = 9))).toMatch(
      /readiness\[0\]\.energy/,
    );
    expect(run((b) => (b.settings = { sex: "robot" }))).toMatch(/settings\.sex/);
  });
});

describe("splitBackup", () => {
  it("puts non-workout data in the first piece only and covers every workout once", () => {
    const pieces = splitBackup(backup(5), 2);
    expect(pieces.map((p) => p.workouts.length)).toEqual([2, 2, 1]);
    expect(pieces[0].weighIns).toHaveLength(1);
    expect(pieces[1].weighIns).toHaveLength(0);
    expect(pieces[2].measurements).toHaveLength(0);
  });
});
