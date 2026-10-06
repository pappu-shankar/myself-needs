import { describe, expect, it } from "vitest";
import type { MuscleVolume } from "../../../engine/types";
import {
  deloadDueRule,
  evaluateGymInsights,
  imbalanceRule,
  loadSpikeRule,
  lowReadinessRule,
  missedSessionRule,
  neglectedMuscleRule,
  newPrsRule,
  plateauRule,
  stalledLiftRule,
  staleWorkoutRule,
  volumeLandmarkRule,
  weeklyGoalRule,
  weightPaceRule,
} from "./rules";
import type { GymSnapshot } from "./types";

/** A quiet week: nothing should fire. Each test overrides only what it's about. */
function snapshot(overrides: Partial<GymSnapshot> = {}): GymSnapshot {
  return {
    today: "2026-10-07",
    weightUnit: "kg",
    weeklySessionGoal: 3,
    sessionsThisWeek: 2,
    sessionsLast28Days: 8,
    daysLeftInWeek: 5,
    stalls: [],
    plateaus: [],
    neglected: [],
    weekVolumes: [],
    trainedRecently: [],
    balance: {
      pushPull: { push: 10, pull: 10, ratio: 1 },
      quadHam: { quad: 6, ham: 5, ratio: 1.2 },
    },
    acwr: { ratio: 1.1, zone: "optimal" },
    consecutiveHardWeeks: 2,
    readiness: null,
    plannedToday: null,
    loggedToday: false,
    missedYesterday: null,
    weight: { goalKg: null, currentKg: null, perWeekKg: null, perWeekPct: null },
    recentPrs: [],
    activeWorkout: null,
    ...overrides,
  };
}

const volume = (overrides: Partial<MuscleVolume>): MuscleVolume => ({
  muscle: "chest",
  hardSets: 10,
  landmark: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 },
  status: "maintenance",
  ...overrides,
});

describe("gym insight rules", () => {
  it("fire nothing on a quiet week", () => {
    expect(evaluateGymInsights(snapshot(), new Set())).toEqual([]);
  });

  it("flags a workout left open for hours", () => {
    expect(
      staleWorkoutRule(snapshot({ activeWorkout: { id: 4, name: "Push", hoursOpen: 2 } })),
    ).toEqual([]);
    const [insight] = staleWorkoutRule(
      snapshot({ activeWorkout: { id: 4, name: "Push", hoursOpen: 7.5 } }),
    );
    expect(insight).toMatchObject({ id: "stale-workout:4", severity: "warning" });
    expect(insight.message).toContain("7 hours");
  });

  it("reports stalls only for progressing exercises past the threshold", () => {
    const insights = stalledLiftRule(
      snapshot({
        stalls: [
          { exerciseId: 1, name: "Bench", stallCount: 3, policy: "linear" },
          { exerciseId: 2, name: "Curl", stallCount: 1, policy: "linear" },
          { exerciseId: 3, name: "Plank", stallCount: 5, policy: "off" },
        ],
      }),
    );
    expect(insights.map((i) => i.id)).toEqual(["stalled-lift:1:3"]);
    expect(insights[0].link).toBe("/health/gym/library/1");
  });

  it("names plateaued lifts with their e1RM", () => {
    const [insight] = plateauRule(
      snapshot({ plateaus: [{ exerciseId: 9, name: "Squat", weeks: 6, bestE1rmKg: 140 }] }),
    );
    expect(insight.message).toContain("140 kg");
    expect(insight.message).toContain("6 weeks");
  });

  it("lists muscles neglected for two weeks or more", () => {
    const insights = neglectedMuscleRule(
      snapshot({
        neglected: [
          { muscle: "hamstring", daysSince: 16 },
          { muscle: "calves", daysSince: 9 },
        ],
      }),
    );
    expect(insights).toHaveLength(1);
    expect(insights[0].message).toBe("No hamstrings work in 16 days.");
  });

  it("judges landmarks only for recently trained muscles", () => {
    const s = snapshot({
      trainedRecently: ["chest", "biceps"],
      weekVolumes: [
        volume({ muscle: "chest", hardSets: 25, status: "above_mrv" }),
        volume({ muscle: "biceps", hardSets: 3, status: "below_mev" }),
        volume({ muscle: "calves", hardSets: 1, status: "below_mev" }),
      ],
    });
    const insights = volumeLandmarkRule(s);
    expect(insights.map((i) => i.id)).toEqual([
      "volume-above-mrv:chest:25",
      "volume-below-mev:biceps:3",
    ]);
    expect(insights[0].severity).toBe("warning");
  });

  it("flags push/pull and quad/ham imbalance with enough sets", () => {
    const insights = imbalanceRule(
      snapshot({
        balance: {
          pushPull: { push: 24, pull: 12, ratio: 2 },
          quadHam: { quad: 15, ham: 5, ratio: 3 },
        },
      }),
    );
    expect(insights.map((i) => i.id)).toEqual(["push-pull:20", "quad-ham:30"]);
    expect(insights[0].message).toContain("more pushing");
  });

  it("ignores ratios built on too few sets", () => {
    expect(
      imbalanceRule(
        snapshot({
          balance: {
            pushPull: { push: 4, pull: 1, ratio: 4 },
            quadHam: { quad: 3, ham: 1, ratio: 3 },
          },
        }),
      ),
    ).toEqual([]);
  });

  it("escalates load spikes by ACWR zone and notes detraining", () => {
    expect(loadSpikeRule(snapshot({ acwr: { ratio: 1.6, zone: "danger" } }))[0].severity).toBe(
      "critical",
    );
    expect(loadSpikeRule(snapshot({ acwr: { ratio: 1.4, zone: "high" } }))[0].severity).toBe(
      "warning",
    );
    expect(loadSpikeRule(snapshot({ acwr: { ratio: 0.5, zone: "low" } }))[0].id).toBe(
      "detraining:2026-10-07",
    );
    expect(loadSpikeRule(snapshot({ acwr: { ratio: null, zone: null } }))).toEqual([]);
  });

  it("suggests a deload after six hard weeks, more urgently with stalls", () => {
    expect(deloadDueRule(snapshot({ consecutiveHardWeeks: 5 }))).toEqual([]);
    expect(deloadDueRule(snapshot({ consecutiveHardWeeks: 7 }))[0].severity).toBe("info");
    expect(
      deloadDueRule(
        snapshot({
          consecutiveHardWeeks: 7,
          stalls: [{ exerciseId: 1, name: "Bench", stallCount: 2, policy: "linear" }],
        }),
      )[0].severity,
    ).toBe("warning");
  });

  it("warns about low readiness only when a session is planned and not yet done", () => {
    const readiness = {
      score: 35,
      band: "rest" as const,
      recommendation: "Rest or do light mobility.",
      factors: [],
    };
    const planned = { routineId: 1, routineName: "Leg Day" };
    expect(lowReadinessRule(snapshot({ readiness }))).toEqual([]);
    expect(
      lowReadinessRule(snapshot({ readiness, plannedToday: planned, loggedToday: true })),
    ).toEqual([]);
    const [insight] = lowReadinessRule(snapshot({ readiness, plannedToday: planned }));
    expect(insight.message).toBe(
      "Readiness 35/100 with Leg Day planned. Rest or do light mobility.",
    );
  });

  it("offers to move a missed session only onto a free day", () => {
    const missed = { routineId: 2, routineName: "Pull Day" };
    expect(missedSessionRule(snapshot({ missedYesterday: missed }))).toHaveLength(1);
    expect(
      missedSessionRule(
        snapshot({ missedYesterday: missed, plannedToday: { routineId: 3, routineName: "Legs" } }),
      ),
    ).toEqual([]);
  });

  it("nags about the weekly goal only once it's at risk", () => {
    expect(weeklyGoalRule(snapshot({ sessionsThisWeek: 1, daysLeftInWeek: 5 }))).toEqual([]);
    expect(weeklyGoalRule(snapshot({ sessionsThisWeek: 1, daysLeftInWeek: 2 }))).toHaveLength(1);
    expect(weeklyGoalRule(snapshot({ sessionsThisWeek: 3, daysLeftInWeek: 1 }))).toEqual([]);
    // Someone who hasn't started training yet isn't "behind".
    expect(
      weeklyGoalRule(snapshot({ sessionsThisWeek: 0, sessionsLast28Days: 0, daysLeftInWeek: 1 })),
    ).toEqual([]);
  });

  it("watches the pace and direction of weight change toward the goal", () => {
    const fast = weightPaceRule(
      snapshot({ weight: { goalKg: 70, currentKg: 80, perWeekKg: -1.2, perWeekPct: -1.5 } }),
    );
    expect(fast.map((i) => i.id)).toEqual(["weight-fast-loss:-12"]);

    const away = weightPaceRule(
      snapshot({ weight: { goalKg: 70, currentKg: 80, perWeekKg: 0.4, perWeekPct: 0.5 } }),
    );
    expect(away.map((i) => i.id)).toEqual(["weight-away-from-goal:4"]);

    expect(
      weightPaceRule(
        snapshot({ weight: { goalKg: 70, currentKg: 70.2, perWeekKg: 0.4, perWeekPct: 0.5 } }),
      ),
    ).toEqual([]);
  });

  it("celebrates this week's PRs", () => {
    const [insight] = newPrsRule(
      snapshot({
        recentPrs: [
          { exerciseId: 1, name: "Bench", type: "e1rm", context: "100 kg × 5", date: "2026-10-06" },
          { exerciseId: 1, name: "Bench", type: "heaviest", context: "100 kg", date: "2026-10-06" },
        ],
      }),
    );
    expect(insight.message).toBe("2 personal records this week — Bench.");
  });

  it("drops dismissed insights and sorts by severity", () => {
    const s = snapshot({
      acwr: { ratio: 1.7, zone: "danger" },
      neglected: [{ muscle: "calves", daysSince: 20 }],
      activeWorkout: { id: 1, name: "Push", hoursOpen: 10 },
    });
    const all = evaluateGymInsights(s, new Set());
    expect(all.map((i) => i.severity)).toEqual(["critical", "warning", "info"]);
    const withoutStale = evaluateGymInsights(s, new Set(["stale-workout:1"]));
    expect(withoutStale.map((i) => i.id)).not.toContain("stale-workout:1");
  });
});
