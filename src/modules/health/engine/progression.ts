import {
  POLICIES_FOR_MODE,
  type BodyPart,
  type ExerciseMode,
  type ProgressionPolicy,
  type WeightUnit,
} from "../gym-types";
import type {
  EntryTarget,
  ExercisePlan,
  ExerciseSession,
  PlannedSet,
  Prescription,
  SetRecord,
} from "./types";
import { formatDuration, formatWeight, lbToKg, snapToStep } from "./units";

/**
 * Automatic progression — the next target for one exercise, derived from its
 * history every time it is needed. Nothing is written back into a finished
 * workout, so changing a policy or fixing a mistyped set immediately gives the
 * right next target, with no stored counters to drift. Behavior follows
 * openGym's progression engine (frontend/src/lib/progression.js).
 *
 * Reading a session honestly is the whole game:
 * - a set checked off with at least its target reps → hit
 * - a set checked off with fewer reps → miss (you logged what you got)
 * - a set never checked off → miss (it was not performed)
 * - fewer sets than prescribed → miss
 * so a session that fell apart can never advance the load.
 */

type ActivePolicy = Exclude<ProgressionPolicy, "off">;

/** Consecutive missed sessions before a deload. Greyskull LP resets on the
 * first failure by design; the others give two more attempts first. */
export const DELOAD_AFTER: Record<ActivePolicy, number> = {
  linear: 3,
  greyskull: 1,
  double: 3,
  time: 3,
};

/** A deload takes 10 % off — Greyskull LP's reset, used for every policy. */
export const DELOAD_FACTOR = 0.9;

/** Past this many sets, more volume stops being progress for bodyweight work;
 * the honest advice is load or a harder variation (openGym issue #33). */
export const MAX_BODYWEIGHT_SETS = 6;

/** Seconds added to a timed hold after a clean session. */
export const TIME_STEP_SEC = 5;

/** Body parts where a 5 kg jump is normal rather than brutal (squats, deadlifts, rows, calves). */
const HEAVY_BODY_PARTS: ReadonlySet<string> = new Set<BodyPart>([
  "upper legs",
  "lower legs",
  "back",
]);

/** Default load step when the routine entry doesn't set one: 5 kg (10 lb) for big
 * lower-body/back lifts, 2.5 kg (5 lb) for everything else — the "lift-specific increment"
 * linear programs live on. Pound steps are whole pounds, converted to kg for storage. */
export function defaultIncrementKg(bodyPart: BodyPart | string, unit: WeightUnit = "kg"): number {
  const heavy = HEAVY_BODY_PARTS.has(bodyPart.toLowerCase().trim());
  if (unit === "lb") return lbToKg(heavy ? 10 : 5);
  return heavy ? 5 : 2.5;
}

/** The policy actually in force: one that makes no sense for the mode (Greyskull on a plank)
 * is treated as off. */
export function effectivePolicy(plan: Pick<ExercisePlan, "mode" | "policy">): ProgressionPolicy {
  return POLICIES_FOR_MODE[plan.mode].includes(plan.policy) ? plan.policy : "off";
}

/** One past session reduced to what a policy needs to judge it. */
export interface JudgedSession {
  workoutId: number;
  date: string;
  mode: ExerciseMode;
  /** Every prescribed set performed at or above target. */
  hit: boolean;
  /** Heaviest completed working load; 0 = bodyweight / unloaded. */
  weightKg: number;
  /** Reps per working set; 0 for a set never checked off. */
  reps: number[];
  /** Seconds held per working set; 0 for a set never checked off. */
  holdsSec: number[];
  /** What the session was judged against (0 = no target known). */
  targetReps: number;
  targetSec: number;
  targetSets: number;
}

/** Sets a prescription speaks for: not warm-ups, not the drop sets tacked on after. */
function isPrescribedSet(set: { kind: string }): boolean {
  return set.kind !== "warmup" && set.kind !== "drop";
}

/**
 * Judge one session. Sessions without a stored target (imports, legacy) are
 * judged against `fallbackTarget` — normally the current plan, via
 * targetFromPlan(). Judging them against nothing would score every imported
 * session as a miss and greet a long-standing user with "deload".
 */
export function judgeSession(
  session: ExerciseSession,
  fallbackTarget: EntryTarget | null,
): JudgedSession {
  const target = session.target ?? fallbackTarget;
  const mode = target?.mode ?? "reps";
  const working = session.sets.filter(isPrescribedSet);
  const reps = working.map((s) => (s.completed ? (s.reps ?? 0) : 0));
  const holdsSec = working.map((s) => (s.completed ? (s.durationSec ?? 0) : 0));
  const targetSets = target?.sets ?? working.length;
  const enough = working.length > 0 && working.length >= targetSets;
  const targetReps = target?.reps ?? 0;
  const targetSec = target?.durationSec ?? 0;

  let hit: boolean;
  if (mode === "time") hit = enough && targetSec > 0 && holdsSec.every((h) => h >= targetSec);
  else if (mode === "reps") hit = enough && targetReps > 0 && reps.every((r) => r >= targetReps);
  else hit = enough && working.every((s) => s.completed);

  return {
    workoutId: session.workoutId,
    date: session.date,
    mode,
    hit,
    weightKg: Math.max(0, ...working.filter((s) => s.completed).map((s) => s.weightKg ?? 0)),
    reps,
    holdsSec,
    targetReps,
    targetSec,
    targetSets,
  };
}

/** How many sessions in a row ended in a miss, counting back from the most recent. */
export function stallCount(judged: ReadonlyArray<Pick<JudgedSession, "hit">>): number {
  let stalls = 0;
  for (let i = judged.length - 1; i >= 0 && !judged[i].hit; i--) stalls++;
  return stalls;
}

/**
 * The plan as a session target — the fallback for sessions that never stored
 * one. For double progression an imported session only has to reach the
 * bottom of the rep range to not count as a stall.
 */
export function targetFromPlan(plan: ExercisePlan): EntryTarget {
  return {
    mode: plan.mode,
    sets: plan.sets,
    reps: effectivePolicy(plan) === "double" && plan.repsMin ? plan.repsMin : plan.reps,
    repsMin: plan.repsMin,
    weightKg: plan.weightKg,
    durationSec: plan.durationSec,
    distanceKm: plan.distanceKm,
    targetRpe: plan.targetRpe,
  };
}

/** Does this past session carry data for the plan's mode? A session logged in another mode
 * (the exercise switched from reps to a timed hold) says nothing about the new target. */
function relevantTo(plan: ExercisePlan, session: ExerciseSession): boolean {
  if (session.target && session.target.mode !== plan.mode) return false;
  return session.sets.some((s: SetRecord) => {
    if (!s.completed || !isPrescribedSet(s)) return false;
    if (plan.mode === "reps") return (s.reps ?? 0) > 0;
    if (plan.mode === "time") return (s.durationSec ?? 0) > 0;
    return true;
  });
}

/** Every relevant past session for a plan, judged, oldest first — also feeds the
 * "stalled lift" insight via stallCount(). */
export function judgeHistory(
  plan: ExercisePlan,
  history: readonly ExerciseSession[],
): JudgedSession[] {
  const fallback = targetFromPlan(plan);
  return history
    .filter((session) => relevantTo(plan, session))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((session) => judgeSession(session, fallback));
}

/**
 * Back off by DELOAD_FACTOR onto something loadable. On small loads the
 * nearest step can be the load you started from, so a deload that would not
 * reduce anything takes one step down instead; never below a single step.
 */
function deloadTo(current: number, step: number): number {
  let next = snapToStep(current * DELOAD_FACTOR, step);
  if (next >= current) next = snapToStep(current - step, step);
  return Math.max(step, next);
}

function timePrescription(plan: ExercisePlan, last: JudgedSession, stalls: number): Prescription {
  const policy = "time";
  const goal = last.targetSec || plan.durationSec || 0;
  if (goal <= 0) {
    return { policy, kind: "hold", reason: "No target hold time yet — set one to progress." };
  }
  if (last.hit) {
    const durationSec = goal + TIME_STEP_SEC;
    return {
      policy,
      kind: "up",
      durationSec,
      reason: `Held every set for the full ${formatDuration(goal)} — +${TIME_STEP_SEC} s to ${formatDuration(durationSec)}.`,
    };
  }
  if (stalls >= DELOAD_AFTER.time) {
    const durationSec = deloadTo(goal, TIME_STEP_SEC);
    return {
      policy,
      kind: "deload",
      durationSec,
      reason: `Came up short ${stalls} sessions running — back off to ${formatDuration(durationSec)} and build up again.`,
    };
  }
  return {
    policy,
    kind: "hold",
    durationSec: goal,
    reason: `Came up short last time — same ${formatDuration(goal)} again.`,
  };
}

/**
 * Bodyweight work (nothing logged on top) has no load to add or take away —
 * "deload your push-ups to 2.5 kg" is not advice — so it progresses in reps:
 * +1, or +2 for per-side work so both sides get the rep. `plan.reps` is the
 * ceiling: reaching it on every set adds a set and restarts at the bottom of
 * the range (`plan.repsMin`, else the ceiling itself), up to
 * MAX_BODYWEIGHT_SETS; past that the advice is load or a harder variation.
 * The trigger is the *logged* load, not the flag: a belted dip has a load and
 * goes through the normal policies. Follows openGym (issue #33).
 */
function bodyweightPrescription(
  plan: ExercisePlan,
  policy: ActivePolicy,
  last: JudgedSession,
): Prescription {
  const goal = last.targetReps || plan.reps || 0;
  const currentSets = Math.max(plan.sets, last.targetSets);
  // Sets added by earlier sessions live only in the log, so keep restating them.
  const sets = currentSets > plan.sets ? currentSets : undefined;
  if (!last.hit || goal <= 0) {
    return {
      policy,
      kind: "hold",
      weightKg: 0,
      reps: goal > 0 ? goal : undefined,
      sets,
      reason:
        goal > 0
          ? `Bodyweight — same ${goal} reps again until every set is clean.`
          : "Bodyweight — set a rep target to progress.",
    };
  }
  const ceiling = plan.reps && plan.reps > 0 ? plan.reps : null;
  if (ceiling !== null && goal >= ceiling) {
    const bottom = plan.repsMin && plan.repsMin < ceiling ? plan.repsMin : ceiling;
    const nextSets = currentSets + 1;
    if (nextSets <= MAX_BODYWEIGHT_SETS) {
      return {
        policy,
        kind: "up",
        weightKg: 0,
        reps: bottom,
        sets: nextSets,
        reason: `${goal} reps on all ${currentSets} sets — add a set: ${nextSets} × ${bottom}.`,
      };
    }
    return {
      policy,
      kind: "hold",
      weightKg: 0,
      reps: goal,
      sets,
      reason: `${currentSets} × ${goal} at bodyweight — time to add weight or move to a harder variation.`,
    };
  }
  const step = plan.perSide ? 2 : 1;
  const reps = ceiling === null ? goal + step : Math.min(ceiling, goal + step);
  return {
    policy,
    kind: "up",
    weightKg: 0,
    reps,
    sets,
    reason: plan.perSide
      ? `Bodyweight — every rep last time, so go for ${reps} (${reps / 2} per side).`
      : `Bodyweight — every rep last time, so go for ${reps}.`,
  };
}

function doublePrescription(
  plan: ExercisePlan,
  last: JudgedSession,
  stalls: number,
  increment: number,
): Prescription {
  const policy = "double";
  const weight = last.weightKg;
  const top = plan.reps ?? (last.targetReps || 10);
  const bottom = Math.min(plan.repsMin ?? Math.max(1, top - 2), top);
  const allSets = last.reps.length >= last.targetSets;
  if (allSets && last.reps.every((r) => r >= top)) {
    return {
      policy,
      kind: "up",
      weightKg: snapToStep(weight + increment, increment),
      reps: bottom,
      reason: `Top of the range (${top} reps) on every set — +${formatWeight(increment, plan.weightUnit)}, back to ${bottom} reps.`,
    };
  }
  if (stalls >= DELOAD_AFTER.double) {
    const weightKg = deloadTo(weight, increment);
    return {
      policy,
      kind: "deload",
      weightKg,
      reps: bottom,
      reason: `Stalled ${stalls} sessions running — deload to ${formatWeight(weightKg, plan.weightUnit)} and rebuild from ${bottom} reps.`,
    };
  }
  const lowest = Math.min(...last.reps);
  const aim = Math.min(top, Math.max(bottom, lowest + (plan.perSide ? 2 : 1)));
  return {
    policy,
    kind: "hold",
    weightKg: weight,
    reps: aim,
    reason: `Same ${formatWeight(weight, plan.weightUnit)} — aim for ${aim} reps on every set.`,
  };
}

function linearPrescription(
  policy: "linear" | "greyskull",
  last: JudgedSession,
  stalls: number,
  increment: number,
  unit: WeightUnit = "kg",
): Prescription {
  const formatKg = (kg: number) => formatWeight(kg, unit);
  const weight = last.weightKg;
  if (last.hit) {
    // Greyskull's last set is taken to failure: double the target there and you've earned a
    // double jump (Greyskull LP, John Sheaffer).
    const amrap = last.reps[last.reps.length - 1] ?? 0;
    const doubleJump =
      policy === "greyskull" && last.targetReps > 0 && amrap >= last.targetReps * 2;
    const step = doubleJump ? increment * 2 : increment;
    return {
      policy,
      kind: "up",
      weightKg: snapToStep(weight + step, increment),
      reason: doubleJump
        ? `Last set hit ${amrap} reps — twice the target, so a double jump: +${formatKg(step)}.`
        : `Every rep last time — +${formatKg(step)}.`,
    };
  }
  const deloadAt = DELOAD_AFTER[policy];
  if (stalls >= deloadAt) {
    const weightKg = deloadTo(weight, increment);
    return {
      policy,
      kind: "deload",
      weightKg,
      reason:
        stalls > 1
          ? `Missed reps ${stalls} sessions running — reset to ${formatKg(weightKg)} and work back up.`
          : `Missed reps — reset 10 % to ${formatKg(weightKg)} and work back up.`,
    };
  }
  const left = deloadAt - stalls;
  return {
    policy,
    kind: "hold",
    weightKg: weight,
    reason: `Missed reps last time — same ${formatKg(weight)} again (${left === 1 ? "1 more miss" : `${left} more misses`} before a deload).`,
  };
}

/**
 * The next prescription for one exercise under its progression policy. Only
 * the standard scheme is handled here; 5/3/1 (wendler.ts) and target-RPE
 * autoregulation (rpe.ts) choose loads their own way. Fields the policy has no
 * opinion on stay undefined so the plan's own value stands.
 */
export function nextPrescription(
  plan: ExercisePlan,
  history: readonly ExerciseSession[],
): Prescription {
  const policy = effectivePolicy(plan);
  if (policy === "off") {
    return { policy, kind: "off", reason: "Progression is off — targets stay where you set them." };
  }
  const judged = judgeHistory(plan, history);
  const last = judged[judged.length - 1];
  if (!last) {
    // A rep range is climbed from the bottom, so the first session starts there.
    const bottom =
      policy === "double" && plan.repsMin !== null && plan.reps !== null
        ? Math.min(plan.repsMin, plan.reps)
        : undefined;
    const needsWeight =
      plan.mode === "reps" && !plan.isBodyweight && !(plan.weightKg && plan.weightKg > 0);
    return {
      policy,
      kind: "first",
      reps: bottom,
      reason: needsWeight
        ? `Nothing logged yet — pick a weight you could do for ${(bottom ?? plan.reps ?? 0) + 2} reps; this session sets the baseline.`
        : "Nothing logged yet — this session sets the baseline.",
    };
  }
  const stalls = stallCount(judged);
  if (plan.mode === "time") return timePrescription(plan, last, stalls);
  if (last.weightKg <= 0) return bodyweightPrescription(plan, policy, last);

  const increment =
    plan.incrementKg && plan.incrementKg > 0
      ? plan.incrementKg
      : defaultIncrementKg(plan.bodyPart, plan.weightUnit);
  if (policy === "double") return doublePrescription(plan, last, stalls, increment);
  if (policy === "linear" || policy === "greyskull") {
    return linearPrescription(policy, last, stalls, increment, plan.weightUnit);
  }
  return { policy, kind: "off", reason: "Progression is off — targets stay where you set them." };
}

/**
 * The sets a session opens with: the plan's numbers, `plan.sets` times. When
 * progression is off, each set instead carries over last session's matching
 * set (or its final one, if the plan grew) — what you did is the best guess
 * at what you'll do. Values from a different logging mode are never carried
 * (a rep count must not seed a hold time).
 */
export function plannedSetsFor(
  plan: ExercisePlan,
  lastSession: ExerciseSession | null,
): PlannedSet[] {
  const count = Math.max(1, plan.sets);
  const sameMode = !lastSession?.target || lastSession.target.mode === plan.mode;
  const previous =
    effectivePolicy(plan) === "off" && lastSession && sameMode
      ? lastSession.sets.filter((s) => s.completed && isPrescribedSet(s))
      : [];
  const sets: PlannedSet[] = [];
  for (let i = 0; i < count; i++) {
    const set: PlannedSet = {
      kind: "working",
      weightKg: plan.weightKg,
      reps: plan.reps,
      durationSec: plan.durationSec,
      distanceKm: plan.distanceKm,
    };
    const prev = previous[i] ?? previous[previous.length - 1];
    if (prev) {
      if (plan.mode === "reps" && (prev.reps ?? 0) > 0) {
        set.weightKg = prev.weightKg;
        set.reps = prev.reps;
      } else if (plan.mode === "time" && (prev.durationSec ?? 0) > 0) {
        set.durationSec = prev.durationSec;
        set.weightKg = prev.weightKg ?? set.weightKg;
      } else if (plan.mode === "cardio") {
        set.durationSec = prev.durationSec ?? set.durationSec;
        set.distanceKm = prev.distanceKm ?? set.distanceKm;
      }
    }
    sets.push(set);
  }
  return sets;
}

/**
 * Apply a prescription to freshly built sets. Only the fields the rule
 * decided are touched, and only on working sets (warm-ups have their own
 * loads). A decided set count grows the list by copying the last working set
 * — never shrinks it. Greyskull LP's final working set is the AMRAP.
 */
export function applyPrescription(
  sets: readonly PlannedSet[],
  prescription: Prescription,
): PlannedSet[] {
  const { weightKg, reps, durationSec } = prescription;
  const out = sets.map((set) => {
    if (set.kind === "warmup") return set;
    const next = { ...set };
    if (weightKg !== undefined) next.weightKg = weightKg;
    if (reps !== undefined) next.reps = reps;
    if (durationSec !== undefined) next.durationSec = durationSec;
    return next;
  });

  const lastWorking = () => out.findLastIndex((set) => set.kind !== "warmup");
  const working = out.filter((set) => set.kind !== "warmup").length;
  if (prescription.sets !== undefined && prescription.sets > working && working > 0) {
    const at = lastWorking();
    const seed: PlannedSet = {
      ...out[at],
      kind: out[at].kind === "amrap" ? "working" : out[at].kind,
    };
    const extra = Array.from({ length: prescription.sets - working }, () => ({ ...seed }));
    out.splice(at + 1, 0, ...extra);
  }
  if (prescription.policy === "greyskull") {
    const at = lastWorking();
    if (at >= 0) {
      out.forEach((set, i) => {
        if (set.kind === "amrap" && i !== at) out[i] = { ...set, kind: "working" };
      });
      out[at] = { ...out[at], kind: "amrap" };
    }
  }
  return out;
}
