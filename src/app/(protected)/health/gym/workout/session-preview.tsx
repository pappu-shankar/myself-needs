import type { ExerciseMode, WeightUnit } from "@/modules/health/types";
import type { PlannedSet } from "@/modules/health/engine/types";
import { formatDuration } from "@/modules/health/engine/units";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { capitalize, describePlannedSets } from "./_lib/format";
import { supersetBlocks } from "./_lib/rest";

/** What the preview needs from a `SessionPlan` entry — mapped in the page. */
export interface PreviewEntry {
  id: number;
  name: string;
  mode: ExerciseMode;
  isBodyweight: boolean;
  perSide: boolean;
  supersetGroup: number | null;
  sets: PlannedSet[];
  restSec: number;
  reason: string;
}

export interface PreviewPlan {
  routineName: string;
  programLabel: string | null;
  entries: PreviewEntry[];
}

/** Today's prescription, exercise by exercise, each with the reason for its numbers. */
export function SessionPreview({
  plan,
  weightUnit = "kg",
}: {
  plan: PreviewPlan;
  weightUnit?: WeightUnit;
}) {
  const superset = new Set(
    supersetBlocks(plan.entries)
      .filter((block) => block.group !== null)
      .flatMap((block) => block.entries.map((entry) => entry.id)),
  );
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-medium">Today: {plan.routineName}</h2>
        </CardTitle>
        <CardDescription>
          {plan.programLabel ?? "What this session will ask of you, and why."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {plan.entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">This routine has no exercises yet.</p>
        ) : (
          <ol className="divide-border flex flex-col divide-y">
            {plan.entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{capitalize(entry.name)}</span>
                  {superset.has(entry.id) && <Badge variant="secondary">Superset</Badge>}
                </div>
                <p className="text-sm tabular-nums">
                  {describePlannedSets(entry.sets, entry.mode, entry.isBodyweight, weightUnit)}
                  {entry.perSide ? " per side" : ""}
                  {entry.restSec > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · rest {formatDuration(entry.restSec)}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">{entry.reason}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
