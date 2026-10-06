import { daysBetween } from "@/lib/dates";
import type { PlannedSet, WeekModifiers } from "./types";
import { roundTo, snapToStep } from "./units";

/**
 * Block periodization (a mesocycle): working sets ramp up week over week —
 * the "start near MEV, add sets toward MRV" model from Israetel, Hoffmann &
 * Smith's Scientific Principles of Strength Training — and an optional final
 * deload week halves the sets, takes 10 % off the loads and 2 off any target
 * RPE so fatigue clears before the next block.
 */

/** 1-based week of a program containing `date`; 0 or less before it starts. */
export function programWeek(startDate: string, date: string): number {
  return Math.floor(daysBetween(startDate, date) / 7) + 1;
}

export interface BlockShape {
  week: number;
  weeks: number;
  /** Working sets added per week after the first. */
  setRampPerWeek: number;
  deloadFinalWeek: boolean;
}

function neutral(week: number, weeks: number, label: string): WeekModifiers {
  return {
    week,
    totalWeeks: weeks,
    isDeload: false,
    setDelta: 0,
    setMultiplier: 1,
    loadFactor: 1,
    rpeDelta: 0,
    label,
  };
}

/** How week `week` of a `weeks`-long block modifies the plan. */
export function blockModifiers({
  week,
  weeks,
  setRampPerWeek,
  deloadFinalWeek,
}: BlockShape): WeekModifiers {
  if (week < 1) return neutral(week, weeks, "Block not started");
  if (week > weeks) return neutral(week, weeks, "Block complete");
  if (deloadFinalWeek && week === weeks) {
    return {
      week,
      totalWeeks: weeks,
      isDeload: true,
      setDelta: 0,
      setMultiplier: 0.5,
      loadFactor: 0.9,
      rpeDelta: -2,
      label: `Week ${week} of ${weeks} · Deload`,
    };
  }
  const setDelta = Math.max(0, (week - 1) * setRampPerWeek);
  return {
    ...neutral(week, weeks, `Week ${week} of ${weeks}`),
    setDelta,
    label:
      setDelta > 0
        ? `Week ${week} of ${weeks} · +${setDelta} set${setDelta === 1 ? "" : "s"}`
        : `Week ${week} of ${weeks}`,
  };
}

/**
 * Apply a week's modifiers to a session's planned sets. Warm-ups pass through
 * untouched; working sets become max(1, ⌈n × setMultiplier⌉) + setDelta
 * (extra sets copy the last working set — slotted before a final AMRAP/to-
 * failure set so that stays last), and loads × loadFactor snapped to `stepKg`.
 */
export function applyWeekModifiers(
  sets: readonly PlannedSet[],
  modifiers: WeekModifiers,
  stepKg: number,
): PlannedSet[] {
  const working = sets.filter((s) => s.kind !== "warmup");
  if (working.length === 0) return [...sets];

  const scale = (s: PlannedSet): PlannedSet =>
    modifiers.loadFactor !== 1 && s.weightKg !== null && s.weightKg > 0
      ? { ...s, weightKg: snapToStep(s.weightKg * modifiers.loadFactor, stepKg) }
      : { ...s };
  // roundTo guards ceil against float noise (10 × 0.3 = 3.0000000000000004).
  const count = Math.max(
    1,
    Math.max(1, Math.ceil(roundTo(working.length * modifiers.setMultiplier, 6))) +
      modifiers.setDelta,
  );
  const block = working.slice(0, count).map(scale);
  const extra = count - block.length;
  if (extra > 0) {
    const seed = block[block.length - 1];
    if (seed.kind === "amrap" || seed.kind === "failure") {
      const copies = Array.from({ length: extra }, () => ({ ...seed, kind: "working" as const }));
      block.splice(block.length - 1, 0, ...copies);
    } else {
      block.push(...Array.from({ length: extra }, () => ({ ...seed })));
    }
  }

  // The working block goes where the first working set was.
  const out: PlannedSet[] = [];
  let placed = false;
  for (const s of sets) {
    if (s.kind === "warmup") out.push(s);
    else if (!placed) {
      out.push(...block);
      placed = true;
    }
  }
  return out;
}
