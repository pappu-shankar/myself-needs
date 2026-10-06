import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LIFTS } from "@/modules/health/engine/strength";
import { formatWeight } from "@/modules/health/engine/units";
import type { BodyOverview } from "@/modules/health";
import type { Sex, WeightUnit } from "@/modules/health/types";
import { LEVEL_LABELS, LIFT_LABELS } from "./body-helpers";

interface StrengthStandardsProps {
  strength: BodyOverview["strength"];
  sex: Sex | null;
  bodyweightKg: number | null;
  unit: WeightUnit;
}

export function StrengthStandards({ strength, sex, bodyweightKg, unit }: StrengthStandardsProps) {
  const prompt =
    !sex || bodyweightKg === null
      ? `Set your ${[!sex && "sex", bodyweightKg === null && "body weight"].filter(Boolean).join(" and ")} (above) to see levels and a DOTS score.`
      : null;
  const rows = LIFTS.map((lift) => {
    const standard = strength.standards?.find((s) => s.lift === lift);
    return {
      lift,
      e1rm: strength.e1rms[lift],
      ratio: standard?.ratio ?? null,
      level: standard?.level ?? null,
      next: standard?.nextLevelKg ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {prompt && (
        <p role="note" className="bg-muted rounded-md px-3 py-2 text-sm">
          {prompt}
        </p>
      )}
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lift</TableHead>
                <TableHead className="text-right">Best e1RM</TableHead>
                <TableHead className="text-right">× bodyweight</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="text-right">Next level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.lift}>
                  <TableCell>{LIFT_LABELS[r.lift]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.e1rm === null ? "—" : formatWeight(r.e1rm, unit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.ratio === null ? "—" : `${r.ratio.toFixed(2)}×`}
                  </TableCell>
                  <TableCell>{r.level ? LEVEL_LABELS[r.level] : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.next === null
                      ? r.level === "elite"
                        ? "Top level"
                        : "—"
                      : formatWeight(r.next, unit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-3 text-xs">
            Best estimated 1RM from the last 180 days. Levels are rough general-population
            bodyweight multiples, not federation data: use them to see roughly where you are, not to
            rank yourself. Pull-ups count bodyweight plus added load.
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <p className="text-muted-foreground text-sm">DOTS score</p>
          {strength.dots !== null && strength.total !== null ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{strength.dots.toFixed(1)}</p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                From an estimated total of {formatWeight(strength.total, unit)} (squat + bench +
                deadlift).
              </p>
            </>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">
              Needs a recent squat, bench press and deadlift, plus your sex and body weight.
            </p>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            DOTS scales a powerlifting total by body weight so lifters of different sizes can be
            compared. Here it uses estimated, not tested, maxes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
