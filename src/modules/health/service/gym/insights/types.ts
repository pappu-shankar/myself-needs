import type { Muscle, ProgressionPolicy, WeightUnit } from "../../../gym-types";
import type { MuscleVolume, PrType, ReadinessResult } from "../../../engine/types";

export type GymInsightCategory = "progress" | "recovery" | "balance" | "consistency" | "body";
export type GymInsightSeverity = "info" | "warning" | "critical";

export interface GymInsight {
  /** Content-derived (`rule:subject:keyFact`) so dismissing one instance doesn't hide a later one with new numbers — same contract as finance insights. */
  id: string;
  category: GymInsightCategory;
  severity: GymInsightSeverity;
  message: string;
  link: string;
}

/**
 * Everything the rules read, gathered once by `snapshot.ts`. Rules are small
 * pure functions over this, so each is testable without a database.
 */
export interface GymSnapshot {
  today: string;
  /** Unit for weights in messages. */
  weightUnit: WeightUnit;
  weeklySessionGoal: number;
  sessionsThisWeek: number;
  /** Finished sessions in the last 28 days — consistency rules stay quiet for someone not training yet. */
  sessionsLast28Days: number;
  /** Days left in the Monday–Sunday week, including today. */
  daysLeftInWeek: number;
  /** Exercises whose recent sessions keep missing their target. */
  stalls: Array<{
    exerciseId: number;
    name: string;
    stallCount: number;
    policy: ProgressionPolicy;
  }>;
  /** Exercises trained regularly whose best e1RM hasn't moved for `weeks`. */
  plateaus: Array<{ exerciseId: number; name: string; weeks: number; bestE1rmKg: number }>;
  /** Muscles trained in the previous 60 days but not in the last 14. */
  neglected: Array<{ muscle: Muscle; daysSince: number }>;
  /** Hard sets per muscle over the last 7 days against its landmarks. */
  weekVolumes: MuscleVolume[];
  /** Muscles with any work in the last 28 days — landmark rules only judge these. */
  trainedRecently: Muscle[];
  /** Hard sets over the last 28 days, for balance ratios. */
  balance: {
    pushPull: { push: number; pull: number; ratio: number | null };
    quadHam: { quad: number; ham: number; ratio: number | null };
  };
  acwr: { ratio: number | null; zone: "low" | "optimal" | "high" | "danger" | null };
  /** Consecutive recent training weeks without a lighter (deload) week. */
  consecutiveHardWeeks: number;
  readiness: ReadinessResult | null;
  plannedToday: { routineId: number; routineName: string } | null;
  loggedToday: boolean;
  missedYesterday: { routineId: number; routineName: string } | null;
  weight: {
    goalKg: number | null;
    currentKg: number | null;
    perWeekKg: number | null;
    perWeekPct: number | null;
  };
  recentPrs: Array<{
    exerciseId: number;
    name: string;
    type: PrType;
    context: string;
    date: string;
  }>;
  activeWorkout: { id: number; name: string; hoursOpen: number } | null;
}

export type GymInsightRule = (snapshot: GymSnapshot) => GymInsight[];
