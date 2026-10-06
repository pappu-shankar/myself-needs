import { MUSCLE_LABELS } from "../../../gym-types";
import { formatWeight } from "../../../engine/units";
import type { GymInsight, GymInsightRule, GymSnapshot } from "./types";

/**
 * One small pure function per rule, `(snapshot) => GymInsight[]`. Adding a
 * rule is one function plus one line in `GYM_RULES`. Thresholds are named so
 * the reasoning is visible next to the number. See docs/prd/health/gym.md.
 */

const STALL_WARN_AT = 2;
const NEGLECT_DAYS = 14;
const PUSH_PULL_LIMIT = 1.5;
const QUAD_HAM_LIMIT = 2;
const MIN_BALANCE_SETS = 10;
const DELOAD_DUE_WEEKS = 6;
const STALE_WORKOUT_HOURS = 6;
/** Losing more than ~1 % of bodyweight a week risks muscle loss. */
const FAST_LOSS_PCT_PER_WEEK = 1;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const staleWorkoutRule: GymInsightRule = (s) =>
  s.activeWorkout && s.activeWorkout.hoursOpen >= STALE_WORKOUT_HOURS
    ? [
        {
          id: `stale-workout:${s.activeWorkout.id}`,
          category: "consistency",
          severity: "warning",
          message: `"${s.activeWorkout.name}" has been open for ${Math.floor(s.activeWorkout.hoursOpen)} hours — finish it to save the sets, or discard it.`,
          link: "/health/gym/workout",
        },
      ]
    : [];

export const stalledLiftRule: GymInsightRule = (s) =>
  s.stalls
    .filter((x) => x.policy !== "off" && x.stallCount >= STALL_WARN_AT)
    .map((x) => ({
      id: `stalled-lift:${x.exerciseId}:${x.stallCount}`,
      category: "progress",
      severity: "warning",
      message: `${x.name}: missed reps ${x.stallCount} sessions running. Check sleep and recovery — the progression rule will deload it if this continues.`,
      link: `/health/gym/library/${x.exerciseId}`,
    }));

export const plateauRule: GymInsightRule = (s) =>
  s.plateaus.map((x) => ({
    id: `plateau:${x.exerciseId}:${x.bestE1rmKg}`,
    category: "progress",
    severity: "info",
    message: `${x.name}'s estimated 1RM has stayed at ${formatWeight(x.bestE1rmKg, s.weightUnit)} for ${plural(x.weeks, "week")}. A new rep range, a variation or a short block can restart progress.`,
    link: `/health/gym/library/${x.exerciseId}`,
  }));

export const neglectedMuscleRule: GymInsightRule = (s) =>
  s.neglected
    .filter((x) => x.daysSince >= NEGLECT_DAYS)
    .map((x) => ({
      id: `neglected-muscle:${x.muscle}:${Math.floor(x.daysSince / 7)}`,
      category: "balance",
      severity: "info",
      message: `No ${MUSCLE_LABELS[x.muscle].toLowerCase()} work in ${x.daysSince} days.`,
      link: "/health/gym/stats",
    }));

export const volumeLandmarkRule: GymInsightRule = (s) => {
  const recent = new Set(s.trainedRecently);
  const out: GymInsight[] = [];
  for (const v of s.weekVolumes) {
    if (!recent.has(v.muscle)) continue;
    const name = MUSCLE_LABELS[v.muscle];
    if (v.status === "above_mrv") {
      out.push({
        id: `volume-above-mrv:${v.muscle}:${Math.round(v.hardSets)}`,
        category: "recovery",
        severity: "warning",
        message: `${name}: ${v.hardSets} hard sets in the last 7 days, above the ~${v.landmark.mrv} most people can recover from. Expect fatigue to outpace progress.`,
        link: "/health/gym/stats",
      });
    } else if (v.status === "below_mev" && v.hardSets > 0) {
      out.push({
        id: `volume-below-mev:${v.muscle}:${Math.round(v.hardSets)}`,
        category: "balance",
        severity: "info",
        message: `${name}: ${v.hardSets} hard sets in the last 7 days — under the ~${v.landmark.mev} usually needed to grow.`,
        link: "/health/gym/stats",
      });
    }
  }
  return out;
};

export const imbalanceRule: GymInsightRule = (s) => {
  const out: GymInsight[] = [];
  const { pushPull, quadHam } = s.balance;
  if (pushPull.ratio !== null && pushPull.push + pushPull.pull >= MIN_BALANCE_SETS) {
    if (pushPull.ratio > PUSH_PULL_LIMIT || pushPull.ratio < 1 / PUSH_PULL_LIMIT) {
      const more = pushPull.ratio > 1 ? "pushing" : "pulling";
      out.push({
        id: `push-pull:${Math.round(pushPull.ratio * 10)}`,
        category: "balance",
        severity: "info",
        message: `Over 4 weeks you did ${Math.round(pushPull.push)} pushing vs ${Math.round(pushPull.pull)} pulling hard sets — a lot more ${more}. Balancing them is kinder to your shoulders.`,
        link: "/health/gym/stats",
      });
    }
  }
  if (
    quadHam.ratio !== null &&
    quadHam.quad + quadHam.ham >= MIN_BALANCE_SETS &&
    quadHam.ratio > QUAD_HAM_LIMIT
  ) {
    out.push({
      id: `quad-ham:${Math.round(quadHam.ratio * 10)}`,
      category: "balance",
      severity: "info",
      message: `Quads got ${Math.round(quadHam.quad)} hard sets to hamstrings' ${Math.round(quadHam.ham)} over 4 weeks. Add a hinge or leg curl.`,
      link: "/health/gym/stats",
    });
  }
  return out;
};

export const loadSpikeRule: GymInsightRule = (s) => {
  const { ratio, zone } = s.acwr;
  if (ratio === null || zone === null) return [];
  const shown = Math.round(ratio * 100) / 100;
  if (zone === "danger" || zone === "high") {
    return [
      {
        id: `load-spike:${s.today}:${zone}`,
        category: "recovery",
        severity: zone === "danger" ? "critical" : "warning",
        message: `This week's training load is ${shown}× your 4-week average. Spikes above ~1.5× are linked to injury — ramp up more gradually.`,
        link: "/health/gym/stats",
      },
    ];
  }
  if (zone === "low") {
    return [
      {
        id: `detraining:${s.today}`,
        category: "consistency",
        severity: "info",
        message: `This week's training load is only ${shown}× your 4-week average. Fine for a planned break — otherwise fitness starts to slip.`,
        link: "/health/gym/stats",
      },
    ];
  }
  return [];
};

export const deloadDueRule: GymInsightRule = (s) =>
  s.consecutiveHardWeeks >= DELOAD_DUE_WEEKS
    ? [
        {
          id: `deload-due:${s.consecutiveHardWeeks}`,
          category: "recovery",
          severity: s.stalls.some((x) => x.stallCount >= STALL_WARN_AT) ? "warning" : "info",
          message: `${s.consecutiveHardWeeks} hard weeks in a row without a lighter one. A deload week (half the sets, ~10 % lighter) usually pays for itself.`,
          link: "/health/gym/programs",
        },
      ]
    : [];

export const lowReadinessRule: GymInsightRule = (s) => {
  const r = s.readiness;
  if (!r || r.score === null || !s.plannedToday || s.loggedToday) return [];
  if (r.band !== "easy" && r.band !== "rest") return [];
  return [
    {
      id: `low-readiness:${s.today}`,
      category: "recovery",
      severity: r.band === "rest" ? "warning" : "info",
      message: `Readiness ${r.score}/100 with ${s.plannedToday.routineName} planned. ${r.recommendation}`,
      link: "/health/gym",
    },
  ];
};

export const missedSessionRule: GymInsightRule = (s) =>
  s.missedYesterday && !s.plannedToday
    ? [
        {
          id: `missed-session:${s.today}:${s.missedYesterday.routineId}`,
          category: "consistency",
          severity: "info",
          message: `${s.missedYesterday.routineName} was planned yesterday and not logged — today is free if you want to move it.`,
          link: "/health/gym/plan",
        },
      ]
    : [];

export const weeklyGoalRule: GymInsightRule = (s) => {
  const remaining = s.weeklySessionGoal - s.sessionsThisWeek;
  if (remaining <= 0 || s.sessionsLast28Days === 0) return [];
  // Only nag once the goal is genuinely at risk: more sessions left than days.
  if (remaining < s.daysLeftInWeek) return [];
  return [
    {
      id: `weekly-goal:${s.today}:${s.sessionsThisWeek}`,
      category: "consistency",
      severity: "info",
      message: `${s.sessionsThisWeek} of ${s.weeklySessionGoal} sessions this week, with ${plural(s.daysLeftInWeek, "day")} left.`,
      link: "/health/gym/plan",
    },
  ];
};

export const weightPaceRule: GymInsightRule = (s) => {
  const { goalKg, currentKg, perWeekKg, perWeekPct } = s.weight;
  if (goalKg === null || currentKg === null || perWeekKg === null || perWeekPct === null) return [];
  const toGo = goalKg - currentKg;
  if (Math.abs(toGo) < 0.5) return [];
  const out: GymInsight[] = [];
  if (toGo < 0 && perWeekPct <= -FAST_LOSS_PCT_PER_WEEK) {
    out.push({
      id: `weight-fast-loss:${Math.round(perWeekKg * 10)}`,
      category: "body",
      severity: "warning",
      message: `Losing ${formatWeight(-perWeekKg, s.weightUnit)} a week (${Math.abs(Math.round(perWeekPct * 10) / 10)} % of bodyweight). Slower than ~1 % a week keeps more muscle.`,
      link: "/health/gym/body",
    });
  }
  if (
    Math.sign(perWeekKg) !== 0 &&
    Math.sign(perWeekKg) !== Math.sign(toGo) &&
    Math.abs(perWeekKg) >= 0.2
  ) {
    out.push({
      id: `weight-away-from-goal:${Math.round(perWeekKg * 10)}`,
      category: "body",
      severity: "info",
      message: `Weight is moving ${perWeekKg > 0 ? "up" : "down"} ${formatWeight(Math.abs(perWeekKg), s.weightUnit)} a week, away from your ${formatWeight(goalKg, s.weightUnit)} goal.`,
      link: "/health/gym/body",
    });
  }
  return out;
};

export const newPrsRule: GymInsightRule = (s) => {
  if (s.recentPrs.length === 0) return [];
  const names = [...new Set(s.recentPrs.map((p) => p.name))];
  return [
    {
      id: `new-prs:${s.recentPrs.map((p) => `${p.exerciseId}${p.type}${p.date}`).join(",")}`,
      category: "progress",
      severity: "info",
      message: `${plural(s.recentPrs.length, "personal record")} this week — ${names.slice(0, 3).join(", ")}${names.length > 3 ? " and more" : ""}.`,
      link: "/health/gym/history",
    },
  ];
};

export const GYM_RULES: GymInsightRule[] = [
  staleWorkoutRule,
  loadSpikeRule,
  lowReadinessRule,
  stalledLiftRule,
  volumeLandmarkRule,
  deloadDueRule,
  weightPaceRule,
  imbalanceRule,
  neglectedMuscleRule,
  plateauRule,
  missedSessionRule,
  weeklyGoalRule,
  newPrsRule,
];

const SEVERITY_ORDER: Record<GymInsight["severity"], number> = { critical: 0, warning: 1, info: 2 };

/** Runs every rule, drops dismissed instances, most severe first (stable within a severity). */
export function evaluateGymInsights(
  snapshot: GymSnapshot,
  dismissed: ReadonlySet<string>,
): GymInsight[] {
  return GYM_RULES.flatMap((rule) => rule(snapshot))
    .filter((insight) => !dismissed.has(insight.id))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
