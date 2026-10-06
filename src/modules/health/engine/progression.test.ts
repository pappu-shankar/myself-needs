import { describe, expect, it } from "vitest";
import {
  applyPrescription,
  defaultIncrementKg,
  DELOAD_AFTER,
  effectivePolicy,
  judgeHistory,
  judgeSession,
  MAX_BODYWEIGHT_SETS,
  nextPrescription,
  plannedSetsFor,
  stallCount,
} from "./progression";
import type { EntryTarget, ExercisePlan, ExerciseSession, PlannedSet, SetRecord } from "./types";
import { kgToLb, lbToKg } from "./units";

const plan = (fields: Partial<ExercisePlan> = {}): ExercisePlan => ({
  exerciseId: 1,
  bodyPart: "chest",
  mode: "reps",
  sets: 3,
  reps: 5,
  repsMin: null,
  weightKg: 60,
  durationSec: null,
  distanceKm: null,
  perSide: false,
  isBodyweight: false,
  policy: "linear",
  incrementKg: null,
  targetRpe: null,
  scheme: "standard",
  ...fields,
});

const target = (fields: Partial<EntryTarget> = {}): EntryTarget => ({
  mode: "reps",
  sets: 3,
  reps: 5,
  repsMin: null,
  weightKg: null,
  durationSec: null,
  distanceKm: null,
  targetRpe: null,
  ...fields,
});

const set = (fields: Partial<SetRecord> = {}): SetRecord => ({
  kind: "working",
  weightKg: null,
  reps: null,
  durationSec: null,
  distanceKm: null,
  rir: null,
  rpe: null,
  completed: true,
  ...fields,
});

const day = (i: number) => `2026-01-${String(i + 1).padStart(2, "0")}`;

/** Sessions from rows of [weight, ...repsPerSet]; a null rep is a set never checked off. */
const hist = (
  rows: Array<Array<number | null>>,
  t: EntryTarget | null = target(),
): ExerciseSession[] =>
  rows.map((row, i) => ({
    workoutId: i + 1,
    date: day(i),
    target: t,
    sets: row
      .slice(1)
      .map((reps) =>
        reps === null
          ? set({ weightKg: row[0], reps: 0, completed: false })
          : set({ weightKg: row[0], reps }),
      ),
  }));

describe("judgeSession", () => {
  const judge = (
    sets: SetRecord[],
    t: EntryTarget | null = target(),
    fallback: EntryTarget | null = null,
  ) => judgeSession({ workoutId: 1, date: "2026-01-01", target: t, sets }, fallback);
  const lift = (reps: number, extra: Partial<SetRecord> = {}) =>
    set({ weightKg: 60, reps, ...extra });

  it("is a hit when every set made its reps", () => {
    const j = judge([lift(5), lift(5), lift(6)]);
    expect(j.hit).toBe(true);
    expect(j.weightKg).toBe(60);
    expect(j.reps).toEqual([5, 5, 6]);
  });

  it("is a miss for short reps, an unchecked set, or fewer sets than prescribed", () => {
    expect(judge([lift(5), lift(5), lift(3)]).hit).toBe(false);
    const unchecked = judge([lift(5), lift(5), lift(5, { completed: false })]);
    expect(unchecked.hit).toBe(false);
    expect(unchecked.reps).toEqual([5, 5, 0]);
    expect(unchecked.weightKg).toBe(60);
    expect(judge([lift(5), lift(5)]).hit).toBe(false);
  });

  it("never calls a session a hit with nothing to judge against", () => {
    expect(judge([lift(5)], null).hit).toBe(false);
  });

  it("judges a targetless session against the fallback", () => {
    expect(judge([lift(5), lift(5), lift(5)], null, target()).hit).toBe(true);
  });

  it("ignores warm-ups and drop sets", () => {
    const j = judge([
      lift(5, { kind: "warmup", weightKg: 100 }),
      lift(5),
      lift(5),
      lift(5),
      lift(2, { kind: "drop", weightKg: 40 }),
    ]);
    expect(j.hit).toBe(true);
    expect(j.weightKg).toBe(60);
  });

  it("reads a timed session by its holds", () => {
    const t = target({ mode: "time", sets: 2, reps: null, durationSec: 45 });
    expect(judge([set({ durationSec: 45 }), set({ durationSec: 50 })], t).hit).toBe(true);
    expect(judge([set({ durationSec: 45 }), set({ durationSec: 30 })], t).hit).toBe(false);
  });
});

describe("stallCount", () => {
  it("counts consecutive misses back from the latest session", () => {
    const s = (...hits: boolean[]) => stallCount(hits.map((hit) => ({ hit })));
    expect(s()).toBe(0);
    expect(s(true, true)).toBe(0);
    expect(s(true, false)).toBe(1);
    expect(s(false, false, false)).toBe(3);
    expect(s(false, true, false)).toBe(1);
  });
});

describe("defaultIncrementKg / effectivePolicy", () => {
  it("gives big lower-body and back lifts the bigger jump", () => {
    expect(defaultIncrementKg("chest")).toBe(2.5);
    expect(defaultIncrementKg("upper legs")).toBe(5);
    expect(defaultIncrementKg("Lower Legs ")).toBe(5);
    expect(defaultIncrementKg("back")).toBe(5);
    expect(defaultIncrementKg("something custom")).toBe(2.5);
  });

  it("treats a policy that makes no sense for the mode as off", () => {
    expect(effectivePolicy({ mode: "time", policy: "greyskull" })).toBe("off");
    expect(effectivePolicy({ mode: "cardio", policy: "linear" })).toBe("off");
    expect(effectivePolicy({ mode: "reps", policy: "double" })).toBe("double");
  });
});

describe("linear progression", () => {
  const p = plan();

  it("has no opinion before there is any history", () => {
    const rx = nextPrescription(p, []);
    expect(rx.kind).toBe("first");
    expect(rx.weightKg).toBeUndefined();
    expect(rx.reason).toMatch(/baseline/);
  });

  it("adds the increment after a clean session", () => {
    const rx = nextPrescription(p, hist([[60, 5, 5, 5]]));
    expect(rx).toMatchObject({ policy: "linear", kind: "up", weightKg: 62.5 });
    expect(rx.reason).toBe("Every rep last time — +2.5 kg.");
  });

  it("repeats the weight after a miss, saying how many tries are left", () => {
    const rx = nextPrescription(p, hist([[60, 5, 5, 3]]));
    expect(rx).toMatchObject({ kind: "hold", weightKg: 60 });
    expect(rx.reason).toContain("2 more misses before a deload");
    expect(
      nextPrescription(
        p,
        hist([
          [60, 5, 5, 3],
          [60, 5, 5, 4],
        ]),
      ).reason,
    ).toContain("1 more miss before");
  });

  it("does not advance when the last set was left unchecked", () => {
    expect(nextPrescription(p, hist([[60, 5, 5, null]]))).toMatchObject({
      kind: "hold",
      weightKg: 60,
    });
  });

  it("deloads 10 % onto a loadable weight after three misses in a row", () => {
    const rx = nextPrescription(
      p,
      hist([
        [60, 5, 5, 3],
        [60, 5, 4, 4],
        [60, 5, 5, 4],
      ]),
    );
    expect(rx).toMatchObject({ kind: "deload", weightKg: 55 });
    expect(rx.reason).toBe("Missed reps 3 sessions running — reset to 55 kg and work back up.");
    expect(DELOAD_AFTER.linear).toBe(3);
  });

  it("lets a good session in between clear the stall", () => {
    expect(
      nextPrescription(
        p,
        hist([
          [60, 5, 5, 3],
          [60, 5, 5, 5],
          [60, 5, 5, 3],
        ]),
      ).kind,
    ).toBe("hold");
  });

  it("never deloads below one step, and always actually reduces", () => {
    const tiny = [
      [2.5, 1, 1, 1],
      [2.5, 1, 1, 1],
      [2.5, 1, 1, 1],
    ];
    expect(nextPrescription(p, hist(tiny)).weightKg).toBe(2.5);
    // 5 × 0.9 = 4.5 snaps back to 5 — no deload at all — so it steps down instead
    const light = [
      [5, 1, 1, 1],
      [5, 1, 1, 1],
      [5, 1, 1, 1],
    ];
    expect(nextPrescription(p, hist(light)).weightKg).toBe(2.5);
  });

  it("uses the bigger step for lower-body lifts and honours an override", () => {
    expect(
      nextPrescription(plan({ bodyPart: "upper legs" }), hist([[100, 5, 5, 5]])).weightKg,
    ).toBe(105);
    expect(nextPrescription(plan({ incrementKg: 1 }), hist([[60, 5, 5, 5]])).weightKg).toBe(61);
  });

  it("progresses from what was lifted, not what was prescribed", () => {
    const sessions = hist([[57.5, 5, 5, 5]], target({ weightKg: 60 }));
    expect(nextPrescription(p, sessions).weightKg).toBe(60);
  });

  it("judges imported sessions without a target against the current plan", () => {
    expect(nextPrescription(p, hist([[60, 5, 5, 5]], null))).toMatchObject({
      kind: "up",
      weightKg: 62.5,
    });
    const longClean = hist(
      Array.from({ length: 11 }, () => [60, 5, 5, 5]),
      null,
    );
    expect(nextPrescription(p, longClean).kind).toBe("up");
    expect(nextPrescription(p, hist([[60, 5, 5, 2]], null)).kind).toBe("hold");
  });

  it("ignores sessions logged in another mode and sorts history by date", () => {
    const timed: ExerciseSession = {
      workoutId: 9,
      date: "2026-01-20",
      target: target({ mode: "time", reps: null, durationSec: 30 }),
      sets: [set({ durationSec: 30 })],
    };
    expect(nextPrescription(p, [timed]).kind).toBe("first");
    const [a, b] = hist([
      [60, 5, 5, 3],
      [60, 5, 5, 5],
    ]);
    expect(nextPrescription(p, [b, a]).kind).toBe("up");
    expect(judgeHistory(p, [b, a]).map((j) => j.workoutId)).toEqual([1, 2]);
  });
});

describe("Greyskull LP", () => {
  const p = plan({ policy: "greyskull" });

  it("advances when the AMRAP makes the target", () => {
    expect(nextPrescription(p, hist([[60, 5, 5, 7]]))).toMatchObject({
      kind: "up",
      weightKg: 62.5,
    });
  });

  it("takes a double jump when the AMRAP doubles the target", () => {
    const rx = nextPrescription(p, hist([[60, 5, 5, 10]]));
    expect(rx).toMatchObject({ kind: "up", weightKg: 65 });
    expect(rx.reason).toBe("Last set hit 10 reps — twice the target, so a double jump: +5 kg.");
  });

  it("resets 10 % on the very first failure", () => {
    const rx = nextPrescription(p, hist([[60, 5, 5, 3]]));
    expect(rx).toMatchObject({ kind: "deload", weightKg: 55 });
    expect(rx.reason).toBe("Missed reps — reset 10 % to 55 kg and work back up.");
    expect(DELOAD_AFTER.greyskull).toBe(1);
  });

  it("keeps resetting from the reduced weight", () => {
    // 55 × 0.9 = 49.5 → nearest 2.5 kg step is 50
    expect(
      nextPrescription(
        p,
        hist([
          [60, 5, 5, 3],
          [55, 5, 5, 2],
        ]),
      ).weightKg,
    ).toBe(50);
  });
});

describe("double progression", () => {
  const p = plan({ policy: "double", reps: 12, repsMin: 8, weightKg: 40 });
  const top = target({ reps: 12, repsMin: 8 });

  it("adds weight and drops to the bottom of the range at the top of it", () => {
    const rx = nextPrescription(p, hist([[40, 12, 12, 12]], top));
    expect(rx).toMatchObject({ kind: "up", weightKg: 42.5, reps: 8 });
    expect(rx.reason).toBe("Top of the range (12 reps) on every set — +2.5 kg, back to 8 reps.");
  });

  it("keeps the weight and aims one rep above the weakest set", () => {
    expect(nextPrescription(p, hist([[40, 10, 9, 9]], top))).toMatchObject({
      kind: "hold",
      weightKg: 40,
      reps: 10,
    });
    expect(nextPrescription(p, hist([[40, 12, 12, 11]], top)).reps).toBe(12);
    expect(nextPrescription(p, hist([[40, 12, 12, null]], top)).reps).toBe(8);
  });

  it("steps per-side work by two", () => {
    expect(nextPrescription({ ...p, perSide: true }, hist([[40, 10, 9, 9]], top)).reps).toBe(11);
  });

  it("deloads after a run of stalls and restarts at the bottom", () => {
    const rx = nextPrescription(
      p,
      hist(
        [
          [40, 9, 9, 9],
          [40, 9, 9, 9],
          [40, 9, 9, 9],
        ],
        top,
      ),
    );
    // 40 × 0.9 = 36 → nearest 2.5 kg step is 35
    expect(rx).toMatchObject({ kind: "deload", weightKg: 35, reps: 8 });
  });

  it("does not count imported sessions inside the range as stalls", () => {
    const imported = hist(
      [
        [40, 9, 9, 9],
        [40, 9, 9, 9],
        [40, 9, 9, 9],
      ],
      null,
    );
    expect(nextPrescription(p, imported)).toMatchObject({ kind: "hold", reps: 10 });
  });

  it("defaults the bottom of the range to two under the top", () => {
    const noMin = plan({ policy: "double", reps: 10, weightKg: 40 });
    expect(nextPrescription(noMin, hist([[40, 10, 10, 10]], target({ reps: 10 }))).reps).toBe(8);
  });
});

describe("timed progression", () => {
  const p = plan({
    mode: "time",
    policy: "time",
    sets: 2,
    reps: null,
    weightKg: null,
    durationSec: 45,
  });
  const t = target({ mode: "time", sets: 2, reps: null, durationSec: 45 });
  const holds = (rows: number[][], tt: EntryTarget | null = t): ExerciseSession[] =>
    rows.map((row, i) => ({
      workoutId: i + 1,
      date: day(i),
      target: tt,
      sets: row.map((durationSec) => set({ durationSec, weightKg: 0 })),
    }));

  it("adds five seconds when every hold went the distance", () => {
    const rx = nextPrescription(p, holds([[45, 47]]));
    expect(rx).toMatchObject({ kind: "up", durationSec: 50 });
    expect(rx.weightKg).toBeUndefined();
    expect(rx.reason).toBe("Held every set for the full 0:45 — +5 s to 0:50.");
  });

  it("repeats a short hold, then backs off after a run of them", () => {
    expect(nextPrescription(p, holds([[45, 38]]))).toMatchObject({ kind: "hold", durationSec: 45 });
    // 45 × 0.9 = 40.5 → nearest 5 s step is 40
    expect(
      nextPrescription(
        p,
        holds([
          [45, 30],
          [45, 32],
          [45, 31],
        ]),
      ),
    ).toMatchObject({
      kind: "deload",
      durationSec: 40,
    });
  });

  it("ignores rep history and asks for a target when there is none", () => {
    expect(nextPrescription(p, hist([[60, 5, 5, 5]])).kind).toBe("first");
    const noGoal = { ...p, durationSec: null };
    expect(nextPrescription(noGoal, holds([[30, 30]], null))).toMatchObject({ kind: "hold" });
  });
});

describe("bodyweight work", () => {
  const bw = (fields: Partial<ExercisePlan> = {}) =>
    plan({ isBodyweight: true, weightKg: null, reps: 15, repsMin: 10, ...fields });
  const at = (reps: number, sets = 3) => target({ reps, sets });

  it("never invents a load to deload to", () => {
    const rx = nextPrescription(
      bw(),
      hist(
        [
          [0, 10, 10, 8],
          [0, 10, 10, 9],
          [0, 10, 10, 8],
        ],
        at(10),
      ),
    );
    expect(rx).toMatchObject({ kind: "hold", weightKg: 0, reps: 10 });
    for (const policy of ["linear", "greyskull", "double"] as const) {
      expect(nextPrescription(bw({ policy }), hist([[0, 10, 10, 4]], at(10))).kind).toBe("hold");
    }
  });

  it("climbs a rep at a time toward the ceiling", () => {
    const rx = nextPrescription(bw(), hist([[0, 10, 10, 10]], at(10)));
    expect(rx).toMatchObject({ kind: "up", weightKg: 0, reps: 11 });
    expect(rx.sets).toBeUndefined();
  });

  it("adds a set and restarts the range at the ceiling", () => {
    const rx = nextPrescription(bw(), hist([[0, 15, 15, 15]], at(15)));
    expect(rx).toMatchObject({ kind: "up", weightKg: 0, reps: 10, sets: 4 });
    expect(rx.reason).toBe("15 reps on all 3 sets — add a set: 4 × 10.");
  });

  it("keeps the added sets while climbing again", () => {
    const rx = nextPrescription(bw(), hist([[0, 11, 11, 11, 11]], at(11, 4)));
    expect(rx).toMatchObject({ kind: "up", reps: 12, sets: 4 });
  });

  it("stops adding sets at the cap and says what to do instead", () => {
    const capped = hist(
      [[0, ...Array<number>(MAX_BODYWEIGHT_SETS).fill(15)]],
      at(15, MAX_BODYWEIGHT_SETS),
    );
    const rx = nextPrescription(bw(), capped);
    expect(rx).toMatchObject({ kind: "hold", reps: 15, sets: 6 });
    expect(rx.reason).toMatch(/harder variation/);
  });

  it("treats plan.reps as the ceiling even without a range", () => {
    expect(
      nextPrescription(bw({ repsMin: null, reps: 10 }), hist([[0, 10, 10, 10]], at(10))),
    ).toMatchObject({
      reps: 10,
      sets: 4,
    });
  });

  it("climbs without end when there is no ceiling", () => {
    const rx = nextPrescription(bw({ reps: null, repsMin: null }), hist([[0, 30, 30, 30]], at(30)));
    expect(rx).toMatchObject({ kind: "up", reps: 31 });
  });

  it("steps unilateral totals by two", () => {
    const rx = nextPrescription(bw({ perSide: true, reps: 20 }), hist([[0, 16, 16, 16]], at(16)));
    expect(rx.reps).toBe(18);
    expect(rx.reason).toContain("(9 per side)");
  });

  it("hands belted work to the normal policies", () => {
    expect(nextPrescription(bw(), hist([[10, 10, 10, 10]], at(10)))).toMatchObject({
      kind: "up",
      weightKg: 12.5,
    });
  });
});

describe("off", () => {
  it("has no opinion at all", () => {
    const rx = nextPrescription(plan({ policy: "off" }), hist([[60, 5, 5, 5]]));
    expect(rx).toMatchObject({ policy: "off", kind: "off" });
    expect(rx.weightKg).toBeUndefined();
    expect(nextPrescription(plan({ mode: "cardio", policy: "linear" }), []).kind).toBe("off");
  });
});

describe("plannedSetsFor", () => {
  it("fills every set from the plan", () => {
    expect(plannedSetsFor(plan(), null)).toEqual(
      Array(3).fill({
        kind: "working",
        weightKg: 60,
        reps: 5,
        durationSec: null,
        distanceKm: null,
      }),
    );
    expect(plannedSetsFor(plan({ sets: 0 }), null)).toHaveLength(1);
  });

  it("carries last session's sets over when progression is off", () => {
    const [last] = hist([[62.5, 6, 5, null]]);
    const sets = plannedSetsFor(plan({ policy: "off", sets: 4 }), last);
    expect(sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [62.5, 6],
      [62.5, 5],
      [62.5, 5],
      [62.5, 5],
    ]);
    // the progression policy decides instead when it is on
    expect(plannedSetsFor(plan(), last)[0].weightKg).toBe(60);
  });

  it("never seeds one mode from another", () => {
    const [last] = hist([[60, 5, 5, 5]]);
    const timed = plan({ mode: "time", policy: "off", reps: null, durationSec: 30, weightKg: 0 });
    expect(plannedSetsFor(timed, last)[0]).toMatchObject({ durationSec: 30, weightKg: 0 });
  });
});

describe("applyPrescription", () => {
  const warm: PlannedSet = {
    kind: "warmup",
    weightKg: 20,
    reps: 10,
    durationSec: null,
    distanceKm: null,
  };
  const work = (weightKg: number, reps: number): PlannedSet => ({
    kind: "working",
    weightKg,
    reps,
    durationSec: null,
    distanceKm: null,
  });

  it("touches only decided fields and leaves warm-ups alone", () => {
    const out = applyPrescription([warm, work(60, 5), work(60, 5)], {
      policy: "linear",
      kind: "up",
      weightKg: 62.5,
      reason: "",
    });
    expect(out).toEqual([warm, work(62.5, 5), work(62.5, 5)]);
  });

  it("grows the list for a decided set count but never shrinks it", () => {
    const grown = applyPrescription([warm, work(0, 10), work(0, 10)], {
      policy: "linear",
      kind: "up",
      reps: 8,
      sets: 4,
      reason: "",
    });
    expect(grown).toEqual([warm, work(0, 8), work(0, 8), work(0, 8), work(0, 8)]);
    const kept = applyPrescription([work(0, 10), work(0, 10)], {
      policy: "linear",
      kind: "hold",
      sets: 1,
      reason: "",
    });
    expect(kept).toHaveLength(2);
  });

  it("makes Greyskull's final working set the AMRAP", () => {
    const out = applyPrescription([warm, work(60, 5), work(60, 5), work(60, 5)], {
      policy: "greyskull",
      kind: "first",
      reason: "",
    });
    expect(out.map((s) => s.kind)).toEqual(["warmup", "working", "working", "amrap"]);
    const grown = applyPrescription(out, { policy: "greyskull", kind: "up", sets: 4, reason: "" });
    expect(grown.map((s) => s.kind)).toEqual(["warmup", "working", "working", "working", "amrap"]);
  });

  it("is a no-op for off and first", () => {
    const sets = [work(60, 5)];
    expect(applyPrescription(sets, { policy: "off", kind: "off", reason: "" })).toEqual(sets);
  });
});

describe("first session", () => {
  const base: ExercisePlan = {
    exerciseId: 1,
    bodyPart: "chest",
    mode: "reps",
    sets: 3,
    reps: 10,
    repsMin: 6,
    weightKg: null,
    durationSec: null,
    distanceKm: null,
    perSide: false,
    isBodyweight: false,
    policy: "double",
    incrementKg: null,
    targetRpe: null,
    scheme: "standard",
  };

  it("starts a rep range at its bottom and asks for a starting weight", () => {
    const p = nextPrescription(base, []);
    expect(p).toMatchObject({ kind: "first", reps: 6 });
    expect(p.reason).toMatch(/pick a weight you could do for 8 reps/);
  });

  it("leaves reps alone for other policies and doesn't ask for weight when one is planned", () => {
    const p = nextPrescription({ ...base, policy: "linear", weightKg: 60 }, []);
    expect(p.reps).toBeUndefined();
    expect(p.reason).toBe("Nothing logged yet — this session sets the baseline.");
  });
});

describe("pound users", () => {
  const plan: ExercisePlan = {
    exerciseId: 1,
    bodyPart: "chest",
    mode: "reps",
    sets: 3,
    reps: 5,
    repsMin: null,
    weightKg: null,
    durationSec: null,
    distanceKm: null,
    perSide: false,
    isBodyweight: false,
    policy: "linear",
    incrementKg: null,
    targetRpe: null,
    scheme: "standard",
    weightUnit: "lb",
  };
  const done = (kg: number): SetRecord => ({
    kind: "working",
    weightKg: kg,
    reps: 5,
    durationSec: null,
    distanceKm: null,
    rir: null,
    rpe: null,
    completed: true,
  });

  it("steps by 5 lb and explains it in pounds", () => {
    const start = lbToKg(135);
    const p = nextPrescription(plan, [
      {
        workoutId: 1,
        date: "2026-10-01",
        target: null,
        sets: [done(start), done(start), done(start)],
      },
    ]);
    expect(p.kind).toBe("up");
    // Snapped in whole grams: within a hundredth of a pound, shown as 140 lb.
    expect(kgToLb(p.weightKg!)).toBeCloseTo(140, 1);
    expect(p.reason).toBe("Every rep last time — +5 lb.");
  });

  it("uses 10 lb for big lower-body lifts", () => {
    expect(kgToLb(defaultIncrementKg("upper legs", "lb"))).toBeCloseTo(10, 6);
    expect(defaultIncrementKg("upper legs")).toBe(5);
  });
});
