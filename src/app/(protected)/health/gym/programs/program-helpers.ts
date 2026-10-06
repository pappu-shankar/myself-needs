import { WENDLER_WEEKS, type WendlerWeek } from "@/modules/health/engine/wendler";

/** Week progress for a progress bar: `current` is clamped to 1..total. */
export function weekProgress(
  week: number,
  total: number,
): { current: number; total: number; percent: number } {
  const safeTotal = Math.max(1, Math.trunc(total));
  const current = Math.min(safeTotal, Math.max(1, Math.trunc(week)));
  return { current, total: safeTotal, percent: Math.round((current / safeTotal) * 100) };
}

/** The set ramp / deload modifiers of a block week, as readable lines. */
export function blockWeekNotes(modifiers: {
  isDeload: boolean;
  setDelta: number;
  setMultiplier: number;
  loadFactor: number;
  rpeDelta: number;
}): string[] {
  if (modifiers.isDeload) {
    return [
      `Deload: about ${Math.round(modifiers.setMultiplier * 100)} % of the usual sets`,
      `Loads at ${Math.round(modifiers.loadFactor * 100)} % of normal`,
      `Target RPE ${modifiers.rpeDelta} lower`,
    ];
  }
  if (modifiers.setDelta > 0) {
    return [
      `+${modifiers.setDelta} working set${modifiers.setDelta === 1 ? "" : "s"} per exercise`,
      "Loads and rep targets follow each routine's progression rule",
    ];
  }
  return ["Normal volume — the set ramp starts next week", "Loads follow each routine's rules"];
}

/** "65 % × 5, 75 % × 5, 85 % × 5+" for a 5/3/1 week (1–4). */
export function wendlerWeekLines(week: number): string[] {
  const spec = WENDLER_WEEKS[(week >= 1 && week <= 4 ? week : 1) as WendlerWeek];
  return spec.percents.map((pct, i) => {
    const plus = spec.amrap && i === spec.percents.length - 1 ? "+" : "";
    return `${Math.round(pct * 100)} % × ${spec.reps[i]}${plus}`;
  });
}
