import { MUSCLE_LABELS } from "@/modules/health/types";
import type { MuscleVolume } from "@/modules/health/engine/types";
import { landmarkGeometry, STATUS_INFO, visibleVolumes } from "./stats-helpers";

function sets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Last 7 days of hard sets per muscle against its MEV / MAV / MRV landmarks.
 * Bars are decorative; the same numbers and the status are always in text.
 */
export function VolumeLandmarks({ volume }: { volume: MuscleVolume[] }) {
  const rows = visibleVolumes(volume);
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No sets logged in the last 7 days.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {rows.map(({ muscle, hardSets, landmark, status }) => {
        const g = landmarkGeometry(landmark, hardSets);
        const info = STATUS_INFO[status];
        return (
          <li key={muscle} data-testid="volume-row">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{MUSCLE_LABELS[muscle]}</span>
              <span className="text-sm tabular-nums">
                <span className="font-semibold">{sets(hardSets)}</span> sets
                <span className="text-muted-foreground"> · </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="inline-block size-2 rounded-full"
                    style={{ background: info.color }}
                  />
                  {info.label}
                </span>
              </span>
            </div>
            <div
              aria-hidden="true"
              className="bg-muted relative mt-1.5 h-3 overflow-hidden rounded-full"
            >
              <div
                className="absolute inset-y-0 opacity-30"
                style={{
                  left: `${g.bandLeft}%`,
                  width: `${g.bandWidth}%`,
                  background: "var(--chart-6)",
                }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${g.value}%`, background: info.color, opacity: 0.85 }}
              />
              <div
                className="bg-foreground/60 absolute inset-y-0 w-px"
                style={{ left: `${g.mev}%` }}
              />
              <div
                className="bg-foreground/60 absolute inset-y-0 w-px"
                style={{ left: `${g.mrv}%` }}
              />
            </div>
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              MEV {landmark.mev} · MAV {landmark.mavLow}–{landmark.mavHigh} · MRV {landmark.mrv}{" "}
              sets/week
            </p>
          </li>
        );
      })}
    </ul>
  );
}
