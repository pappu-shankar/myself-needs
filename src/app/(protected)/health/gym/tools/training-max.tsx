"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { formatWeight } from "@/modules/health/engine/units";
import {
  suggestTrainingMax,
  TM_FACTOR,
  WENDLER_WEEKS,
  wendlerSets,
  type WendlerWeek,
} from "@/modules/health/engine/wendler";
import type { WeightUnit } from "@/modules/health/types";
import { parsePositive, typedToKg } from "./tool-utils";

const WEEKS: WendlerWeek[] = [1, 2, 3, 4];

export function TrainingMaxTool({ stepKg, unit }: { stepKg: number; unit: WeightUnit }) {
  const [e1rm, setE1rm] = useState(unit === "lb" ? "265" : "120");
  const e1rmKg = typedToKg(parsePositive(e1rm), unit);
  const tm = e1rmKg !== null ? suggestTrainingMax(e1rmKg, stepKg) : null;

  return (
    <div className="flex flex-col gap-4">
      <FormField label={`Estimated 1RM (${unit})`} htmlFor="tmE1rm" className="sm:w-56">
        <Input
          type="number"
          step="any"
          inputMode="decimal"
          value={e1rm}
          onChange={(e) => setE1rm(e.target.value)}
          className="tabular-nums"
        />
      </FormField>
      {tm !== null ? (
        <div aria-live="polite" className="flex flex-col gap-4">
          <p className="text-sm tabular-nums">
            Training max ({TM_FACTOR * 100} % of e1RM):{" "}
            <span className="text-lg font-semibold">{formatWeight(tm, unit)}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {WEEKS.map((week) => {
              const sets = wendlerSets("wendler_main", tm, week, stepKg);
              const spec = WENDLER_WEEKS[week];
              return (
                <div key={week} className="rounded-lg border p-3">
                  <h3 className="text-sm font-medium">
                    Week {week}: {spec.label}
                  </h3>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-sm tabular-nums">
                    {sets.map((s, i) => (
                      <li key={i} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {Math.round(spec.percents[i] * 100)} %
                        </span>
                        <span>
                          {formatWeight(s.weightKg ?? 0, unit)} × {s.reps}
                          {s.kind === "amrap" ? "+" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Enter an estimated 1RM.</p>
      )}
      <p className="text-muted-foreground text-xs">
        From Jim Wendler&apos;s 5/3/1: base the percentages on 90 % of your max so every set stays
        achievable. The + means as many good reps as you can on the last set.
      </p>
    </div>
  );
}
