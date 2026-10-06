import type { SessionPlan } from "@/modules/health";
import { formatDuration, formatWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/types";

/** "3 × 5 @ 62.5 kg", "3 × 0:45", "20:00 · 3 km" — one planned entry at a glance. */
export function plannedSummary(
  entry: SessionPlan["entries"][number],
  unit: WeightUnit = "kg",
): string {
  const working = entry.sets.filter((s) => s.kind !== "warmup");
  const first = working[0];
  if (!first) return "No sets";
  if (entry.plan.mode === "cardio") {
    const parts = [first.durationSec ? formatDuration(first.durationSec) : null];
    if (first.distanceKm) parts.push(`${first.distanceKm} km`);
    return parts.filter(Boolean).join(" · ") || "Cardio";
  }
  const amount =
    entry.plan.mode === "time" ? formatDuration(first.durationSec ?? 0) : String(first.reps ?? "?");
  const sameLoad = working.every((s) => s.weightKg === first.weightKg);
  const load =
    first.weightKg && first.weightKg > 0
      ? ` @ ${entry.plan.isBodyweight ? "+" : ""}${formatWeight(first.weightKg, unit)}${sameLoad ? "" : "…"}`
      : "";
  return `${working.length} × ${amount}${load}`;
}

/** The prescribed session, entry by entry, with each target's reason. */
export function SessionPreview({ plan, unit = "kg" }: { plan: SessionPlan; unit?: WeightUnit }) {
  return (
    <ol className="flex flex-col gap-3">
      {plan.entries.map((entry) => (
        <li key={entry.entry.id} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{entry.entry.exercise.name}</span>
            <span className="tabular-nums whitespace-nowrap">{plannedSummary(entry, unit)}</span>
          </div>
          <p className="text-muted-foreground text-xs">{entry.prescription.reason}</p>
        </li>
      ))}
    </ol>
  );
}
