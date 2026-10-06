"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toDisplayWeight } from "@/modules/health/engine/units";
import { nearestLoadable, platesPerSide } from "@/modules/health/engine/plates";
import type { WeightUnit } from "@/modules/health/types";
import { describePlates, loadableAbove, plateShapes } from "./plate-layout";
import { formatInUnit, parsePlates, parsePositive, plateSizesInUnit } from "./tool-utils";

/** Works in the user's unit end to end: bar and plates from settings are shown converted. */
export function PlateCalculator({
  barWeightKg,
  platesKg,
  unit,
}: {
  barWeightKg: number;
  platesKg: number[];
  unit: WeightUnit;
}) {
  const [target, setTarget] = useState(unit === "lb" ? "225" : "100");
  const [bar, setBar] = useState(String(toDisplayWeight(barWeightKg, unit)));
  const [plateText, setPlateText] = useState(plateSizesInUnit(platesKg, unit).join(", "));
  const fmt = (n: number) => formatInUnit(n, unit);

  const targetKg = parsePositive(target);
  const barKg = parsePositive(bar);
  const plates = parsePlates(plateText);
  const ready = targetKg !== null && barKg !== null && plates !== null && plates.length > 0;
  const load = ready ? platesPerSide(targetKg, barKg, plates) : null;
  const below = ready ? nearestLoadable(targetKg, barKg, plates, "down") : null;
  const above = ready ? loadableAbove(targetKg, barKg, plates) : null;
  const shapes = load ? plateShapes(load.plates, unit) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label={`Target weight (${unit})`} htmlFor="plateTarget">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <FormField label={`Bar weight (${unit})`} htmlFor="plateBar">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={bar}
            onChange={(e) => setBar(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <FormField
          label={`Plates you have (${unit})`}
          htmlFor="platePlates"
          hint="Comma-separated, one pair of each. Editing here doesn't change your settings."
          error={
            plates === null
              ? `Enter plate sizes as numbers, e.g. ${unit === "lb" ? "45, 25, 10" : "25, 20, 10"}`
              : undefined
          }
        >
          <Input
            type="text"
            value={plateText}
            onChange={(e) => setPlateText(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
      </div>

      {load && targetKg !== null && barKg !== null ? (
        <div aria-live="polite" className="flex flex-col gap-3">
          <div
            aria-hidden="true"
            className="bg-muted/50 flex h-32 items-center overflow-hidden rounded-md px-3"
          >
            <div className="bg-muted-foreground/40 h-3 w-8 shrink-0 rounded-sm" />
            <div className="bg-muted-foreground/60 h-6 w-2 shrink-0 rounded-sm" />
            <div className="flex h-full items-center gap-0.5 pl-0.5">
              {shapes.map((s, i) => (
                <div
                  key={i}
                  className="flex shrink-0 items-center justify-center rounded-sm text-[9px] leading-none font-medium text-white tabular-nums"
                  style={{ height: `${s.heightPct}%`, width: s.widthPx, background: s.color }}
                >
                  <span className="[writing-mode:vertical-rl]">{s.size}</span>
                </div>
              ))}
            </div>
            <div className="bg-muted-foreground/40 h-3 min-w-4 flex-1 rounded-sm" />
          </div>
          <p className="text-sm">
            <span className="font-medium">Per side:</span>{" "}
            <span className="tabular-nums">
              {load.plates.length ? describePlates(load.plates, unit) : "empty bar"}
            </span>
          </p>
          <p className="text-sm tabular-nums">
            Loads to <span className="font-semibold">{fmt(load.loadedKg)}</span>{" "}
            {load.exact ? (
              "(exact)."
            ) : load.remainderKg < 0 ? (
              `— the bar alone is heavier than ${fmt(targetKg)}.`
            ) : (
              <>
                (not exact: {fmt(load.remainderKg)} short with these plates). Nearest loadable:{" "}
                <span className="font-semibold">{fmt(below ?? load.loadedKg)}</span> below
                {above !== null && above !== below && (
                  <>
                    , <span className="font-semibold">{fmt(above)}</span> above
                  </>
                )}
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Enter a target, a bar weight and at least one plate size.
        </p>
      )}
    </div>
  );
}
