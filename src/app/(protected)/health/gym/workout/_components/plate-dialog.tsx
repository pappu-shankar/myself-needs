"use client";

import { useId, useState } from "react";
import type { WeightUnit } from "@/modules/health/types";
import { platesPerSide } from "@/modules/health/engine/plates";
import { formatWeight, fromDisplayWeight, toDisplayWeight } from "@/modules/health/engine/units";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { formatWeightInput, parseWeight } from "../_lib/set-input";

interface PlateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWeightKg: number;
  barKg: number;
  platesKg: number[];
  weightUnit?: WeightUnit;
}

/** Plates per side for a set's weight, from the bar and plates in gym settings. Remount (key) per weight. */
export function PlateDialog({
  open,
  onOpenChange,
  initialWeightKg,
  barKg,
  platesKg,
  weightUnit = "kg",
}: PlateDialogProps) {
  const [text, setText] = useState(formatWeightInput(initialWeightKg, weightUnit));
  const inputId = useId();
  const parsed = parseWeight(text, weightUnit);
  // The math runs in the display unit: lb plates stored as kg (20.412 for 45 lb)
  // drift a gram here and there, and 225 lb must load as exactly 45 + 45 per side.
  const shown = (kg: number) => toDisplayWeight(kg, weightUnit);
  const fmt = (value: number) => formatWeight(fromDisplayWeight(value, weightUnit), weightUnit);
  const bar = shown(barKg);
  const plateSizes = platesKg.map(shown);
  const target = parsed.ok && parsed.value !== null ? shown(parsed.value) : null;
  const load = target !== null ? platesPerSide(target, bar, plateSizes) : null;
  const perSide = load ? load.plates.reduce((sum, plate) => sum + plate, 0) : 0;
  const heaviest = Math.max(...plateSizes, 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plate calculator</DialogTitle>
          <DialogDescription>
            Plates for one side of a {fmt(bar)} bar — load the same on the other.
          </DialogDescription>
        </DialogHeader>
        <FormField
          label={`Total weight (${weightUnit})`}
          htmlFor={inputId}
          error={parsed.ok ? undefined : parsed.error}
        >
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 text-base tabular-nums"
          />
        </FormField>
        {load && target !== null && (
          <div className="flex flex-col gap-3" aria-live="polite">
            {target < bar ? (
              <p className="text-sm">
                That&apos;s lighter than the empty bar ({fmt(bar)}) — use a lighter bar or
                dumbbells.
              </p>
            ) : load.plates.length === 0 ? (
              <p className="text-sm">Just the empty bar.</p>
            ) : (
              <>
                <ul
                  aria-label="Plates per side, heaviest first"
                  className="flex min-h-20 flex-wrap items-center gap-1.5"
                >
                  {load.plates.map((plate, index) => (
                    <li
                      key={`${plate}-${index}`}
                      className="bg-primary text-primary-foreground flex w-11 items-center justify-center rounded-md text-xs font-semibold tabular-nums"
                      style={{ height: `${1.75 + (plate / heaviest) * 3.25}rem` }}
                    >
                      {plate}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {fmt(perSide)} per side · {fmt(load.loadedKg)} on the bar
                </p>
              </>
            )}
            {!load.exact && target >= bar && (
              <p className="text-sm font-medium">
                Not exactly loadable with your plates — closest is {fmt(load.loadedKg)} (
                {fmt(load.remainderKg)} short).
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
