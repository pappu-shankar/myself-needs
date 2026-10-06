"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { platesPerSide } from "@/modules/health/engine/plates";
import { formatWeight, toDisplayWeight } from "@/modules/health/engine/units";
import { warmupSets } from "@/modules/health/engine/warmup";
import { describePlates } from "./plate-layout";
import type { WeightUnit } from "@/modules/health/types";
import { parsePositive, plateSizesInUnit, typedToKg } from "./tool-utils";

export function WarmupGenerator({
  barWeightKg,
  platesKg,
  stepKg,
  unit,
}: {
  barWeightKg: number;
  platesKg: number[];
  stepKg: number;
  unit: WeightUnit;
}) {
  const [weight, setWeight] = useState(unit === "lb" ? "225" : "100");
  const [reps, setReps] = useState("5");
  const workingKg = typedToKg(parsePositive(weight), unit);
  const barDisplay = toDisplayWeight(barWeightKg, unit);
  const plates = plateSizesInUnit(platesKg, unit);
  const workingReps = parsePositive(reps);
  const sets =
    workingKg !== null && workingReps !== null
      ? warmupSets({
          workingKg,
          workingReps: Math.round(workingReps),
          barKg: barWeightKg,
          stepKg,
          isBodyweight: false,
        })
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <FormField label={`Working weight (${unit})`} htmlFor="warmupWeight">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <FormField label="Working reps" htmlFor="warmupReps">
          <Input
            type="number"
            step="1"
            min="1"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
      </div>
      {sets.length > 0 ? (
        <ol className="m-0 flex list-none flex-col divide-y p-0" aria-live="polite">
          {sets.map((s, i) => {
            const side =
              s.weightKg !== null && plates.length > 0
                ? platesPerSide(toDisplayWeight(s.weightKg, unit), barDisplay, plates).plates
                : [];
            return (
              <li key={i} className="flex flex-wrap justify-between gap-x-4 py-2 text-sm">
                <span className="tabular-nums">
                  <span className="font-semibold">{formatWeight(s.weightKg ?? 0, unit)}</span> ×{" "}
                  {s.reps}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {side.length ? `Per side: ${describePlates(side, unit)}` : "Empty bar"}
                </span>
              </li>
            );
          })}
          <li className="flex justify-between py-2 text-sm font-medium tabular-nums">
            <span>
              Working: {formatWeight(workingKg ?? 0, unit)} × {Math.round(workingReps ?? 0)}
            </span>
          </li>
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          {workingKg !== null && workingKg <= barWeightKg
            ? "The working weight is the bar itself — no warm-up needed."
            : "Enter a working weight and reps."}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        An empty-bar set, then roughly 40 %, 60 % and 80 % of the working weight with fewer reps
        each time, so you warm up without getting tired.
      </p>
    </div>
  );
}
