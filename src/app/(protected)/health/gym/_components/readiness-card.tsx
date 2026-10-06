import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReadinessOverview } from "@/modules/health";
import type { ReadinessBand } from "@/modules/health/types";

const BAND_INFO: Record<ReadinessBand, { label: string; color: string }> = {
  push: { label: "Push", color: "var(--chart-6)" },
  normal: { label: "Normal", color: "var(--chart-1)" },
  easy: { label: "Take it easy", color: "var(--chart-4)" },
  rest: { label: "Rest", color: "var(--chart-8)" },
};

const IMPACT = {
  positive: { Icon: ArrowUp, label: "Helps readiness" },
  neutral: { Icon: Minus, label: "Neutral" },
  negative: { Icon: ArrowDown, label: "Lowers readiness" },
} as const;

function hours(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Today's readiness score and why. Presentational and server-safe (no hooks). */
export function ReadinessCard({ readiness }: { readiness: ReadinessOverview }) {
  const { score, band, recommendation, factors, sleepHours, sleepTargetHours } = readiness;
  const info = band ? BAND_INFO[band] : null;
  const sleepPct =
    sleepHours !== null && sleepTargetHours > 0
      ? Math.min(100, Math.round((sleepHours / sleepTargetHours) * 100))
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Readiness today</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {score === null || !info ? (
          <p className="text-sm" data-testid="readiness-empty">
            {"Log last night's sleep or do today's check-in to get a readiness score."}
          </p>
        ) : (
          <div className="flex items-center gap-4">
            <div
              className="flex size-16 shrink-0 flex-col items-center justify-center rounded-full border-4"
              style={{ borderColor: info.color }}
            >
              <span className="text-xl leading-none font-semibold tabular-nums">{score}</span>
              <span className="text-muted-foreground text-[10px] tabular-nums">/ 100</span>
            </div>
            <div>
              <p className="font-medium">{info.label}</p>
              <p className="text-muted-foreground text-sm">{recommendation}</p>
            </div>
          </div>
        )}

        {sleepPct !== null && sleepHours !== null && (
          <div>
            <p className="flex justify-between text-sm tabular-nums">
              <span>Sleep</span>
              <span>
                {hours(sleepHours)} h of {hours(sleepTargetHours)} h target
              </span>
            </p>
            <div
              role="progressbar"
              aria-label="Sleep against target"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={sleepPct}
              className="bg-muted mt-1 h-2 overflow-hidden rounded-full"
            >
              <div className="bg-primary h-full" style={{ width: `${sleepPct}%` }} />
            </div>
          </div>
        )}

        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {factors.map((f) => {
            const { Icon, label } = IMPACT[f.impact];
            return (
              <li key={f.label} className="flex items-start gap-2 text-sm">
                <Icon aria-label={label} role="img" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium">{f.label}.</span>{" "}
                  <span className="text-muted-foreground">{f.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-xs">
          A heuristic blend of sleep, your check-in and recent training load, not a medical measure.
        </p>
      </CardContent>
    </Card>
  );
}
