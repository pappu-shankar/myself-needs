"use client";

import { useState } from "react";
import { REP_CAP, estimate1rm, repMaxTable } from "@/modules/health/engine/e1rm";
import { formatWeight, fromDisplayWeight } from "@/modules/health/engine/units";
import type { E1rmFormula } from "@/modules/health/types";
import type { WeightUnit } from "@/modules/health/gym-types";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { RepMaxTable } from "./rep-max-table";

const FORMULA_LABELS: Record<E1rmFormula, string> = {
  epley: "Epley",
  brzycki: "Brzycki",
  lombardi: "Lombardi",
};

/** Weight + reps → estimated 1RM and the rep-max table that follows from it. */
export function OneRmCalculator({
  formula,
  weightUnit = "kg",
}: {
  formula: E1rmFormula;
  weightUnit?: WeightUnit;
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const weightKg = fromDisplayWeight(Number.parseFloat(weight), weightUnit);
  const repCount = Number.parseInt(reps, 10);
  const touched = weight !== "" && reps !== "";
  const tooMany = Number.isFinite(repCount) && repCount > REP_CAP;
  const e1rm =
    touched && !tooMany && Number.isFinite(weightKg) && Number.isFinite(repCount)
      ? estimate1rm(weightKg, repCount, formula)
      : null;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField label={`Weight (${weightUnit})`} htmlFor="calc-weight">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className="tabular-nums"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </FormField>
        <FormField label="Reps" htmlFor="calc-reps">
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            className="tabular-nums"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
        </FormField>
      </div>
      <div aria-live="polite" className="text-sm">
        {tooMany ? (
          <p className="text-destructive">
            Estimates past {REP_CAP} reps are unreliable — the formulas disagree by double digits
            and say more about endurance than maximal strength. Use a heavier set of {REP_CAP} reps
            or fewer.
          </p>
        ) : e1rm !== null ? (
          <p>
            Estimated 1RM{" "}
            <strong className="text-base tabular-nums">{formatWeight(e1rm, weightUnit)}</strong>{" "}
            <span className="text-muted-foreground">({FORMULA_LABELS[formula]} formula)</span>
          </p>
        ) : touched ? (
          <p className="text-muted-foreground">Enter a weight above 0 and at least 1 rep.</p>
        ) : (
          <p className="text-muted-foreground">
            Enter a recent hard set to estimate your one-rep max (up to {REP_CAP} reps).
          </p>
        )}
      </div>
      {e1rm !== null && (
        <RepMaxTable
          rows={repMaxTable(e1rm, formula)}
          weightUnit={weightUnit}
          caption={`Rep maxes from an estimated 1RM of ${formatWeight(e1rm, weightUnit)}`}
        />
      )}
    </div>
  );
}
