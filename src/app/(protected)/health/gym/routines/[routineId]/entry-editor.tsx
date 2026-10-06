"use client";

import { useActionState, useState } from "react";
import {
  updateRoutineEntryAction,
  type UpdateRoutineEntryState,
} from "@/modules/health/actions/gym/routines";
import {
  EXERCISE_MODES,
  EXERCISE_MODE_LABELS,
  LOADING_SCHEMES,
  LOADING_SCHEME_LABELS,
  POLICIES_FOR_MODE,
  POLICY_DESCRIPTIONS,
  POLICY_LABELS,
  type ExerciseMode,
  type ProgressionPolicy,
} from "@/modules/health/types";
import type { RoutineEntry } from "@/modules/health";
import { fromDisplayWeight, toDisplayWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/gym-types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

const initialState: UpdateRoutineEntryState = {};
const selectClass = "border-input bg-background h-8 rounded-md border px-3 text-sm";

function numberValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function NumberField({
  label,
  name,
  entryId,
  value,
  hint,
  error,
  required,
  step = "any",
}: {
  label: string;
  name: string;
  entryId: number;
  value: number | null;
  hint?: string;
  error?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <FormField label={label} htmlFor={`entry-${entryId}-${name}`} hint={hint} error={error}>
      <Input
        type="number"
        name={name}
        step={step}
        min="0"
        inputMode="decimal"
        required={required}
        defaultValue={numberValue(value)}
        className="tabular-nums"
      />
    </FormField>
  );
}

/**
 * A weight typed in the display unit. The visible input is unnamed; a hidden
 * input carries the kg value (rounded to grams) that the action expects.
 */
function WeightField({
  label,
  name,
  entryId,
  valueKg,
  unit,
  hint,
  error,
}: {
  label: string;
  name: string;
  entryId: number;
  valueKg: number | null;
  unit: WeightUnit;
  hint?: string;
  error?: string;
}) {
  const [text, setText] = useState(valueKg === null ? "" : String(toDisplayWeight(valueKg, unit)));
  const parsed = Number.parseFloat(text);
  const kg = Number.isFinite(parsed)
    ? String(Math.round(fromDisplayWeight(parsed, unit) * 1000) / 1000)
    : "";
  return (
    <FormField
      label={`${label} (${unit})`}
      htmlFor={`entry-${entryId}-${name}`}
      hint={hint}
      error={error}
    >
      <Input
        type="number"
        step="any"
        min="0"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="tabular-nums"
      />
      <input type="hidden" name={name} value={kg} />
    </FormField>
  );
}

interface EntryEditorProps {
  entry: RoutineEntry;
  weightUnit: WeightUnit;
  routinePolicy: ProgressionPolicy;
  onDone: () => void;
}

/** Every field of one routine entry. Blank numbers clear the value. */
export function EntryEditor({ entry, routinePolicy, weightUnit, onDone }: EntryEditorProps) {
  const [state, formAction, pending] = useActionState(updateRoutineEntryAction, initialState);
  const [mode, setMode] = useState<ExerciseMode>(entry.mode);
  const [policy, setPolicy] = useState<ProgressionPolicy | "inherit">(
    entry.progressionPolicy ?? "inherit",
  );
  useActionSuccess(state, onDone);

  const allowed = POLICIES_FOR_MODE[mode];
  const chosenPolicy = allowed.includes(policy as ProgressionPolicy) ? policy : "inherit";
  const resolved: ProgressionPolicy =
    chosenPolicy === "inherit"
      ? allowed.includes(routinePolicy)
        ? routinePolicy
        : "off"
      : (chosenPolicy as ProgressionPolicy);
  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];
  const id = entry.id;

  return (
    <form action={formAction} className="border-border mt-3 grid gap-4 border-t pt-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-4">
        <FormField label="Logged as" htmlFor={`entry-${id}-mode`} className="col-span-2">
          <select
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as ExerciseMode)}
            className={selectClass}
          >
            {EXERCISE_MODES.map((m) => (
              <option key={m} value={m}>
                {EXERCISE_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </FormField>
        <NumberField
          label="Sets"
          name="sets"
          entryId={id}
          value={entry.sets}
          required
          step="1"
          error={fieldError("sets")}
        />
        {mode === "reps" && (
          <NumberField
            label={resolved === "double" ? "Reps (top of range)" : "Reps"}
            name="reps"
            entryId={id}
            value={entry.reps}
            step="1"
            error={fieldError("reps")}
          />
        )}
        {mode === "reps" && resolved === "double" && (
          <NumberField
            label="Reps (bottom of range)"
            name="repsMin"
            entryId={id}
            value={entry.repsMin}
            step="1"
            error={fieldError("repsMin")}
          />
        )}
        {mode !== "reps" && (
          <NumberField
            label="Duration (seconds)"
            name="durationSec"
            entryId={id}
            value={entry.durationSec}
            step="1"
            error={fieldError("durationSec")}
          />
        )}
        {mode === "cardio" && (
          <NumberField
            label="Distance (km)"
            name="distanceKm"
            entryId={id}
            value={entry.distanceKm}
            error={fieldError("distanceKm")}
          />
        )}
        {mode !== "cardio" && (
          <WeightField
            label={mode === "time" ? "Added weight" : "Weight"}
            name="weightKg"
            entryId={id}
            valueKg={entry.weightKg}
            unit={weightUnit}
            hint="Leave blank to let history decide."
            error={fieldError("weightKg")}
          />
        )}
        <NumberField
          label="Rest (seconds)"
          name="restSec"
          entryId={id}
          value={entry.restSec}
          step="1"
          hint="Blank uses your default."
          error={fieldError("restSec")}
        />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="perSide" defaultChecked={entry.perSide} className="size-4" />
          Per side
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isBodyweight"
            defaultChecked={entry.isBodyweight}
            className="size-4"
          />
          Bodyweight exercise
        </label>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {mode !== "cardio" && (
          <FormField
            label="Progression rule"
            htmlFor={`entry-${id}-progressionPolicy`}
            hint={POLICY_DESCRIPTIONS[resolved]}
          >
            <select
              name="progressionPolicy"
              value={chosenPolicy}
              onChange={(e) => setPolicy(e.target.value as ProgressionPolicy | "inherit")}
              className={selectClass}
            >
              <option value="inherit">Inherit from routine ({POLICY_LABELS[routinePolicy]})</option>
              {allowed.map((p) => (
                <option key={p} value={p}>
                  {POLICY_LABELS[p]}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {mode === "reps" && (
          <WeightField
            label="Load increment"
            name="incrementKg"
            entryId={id}
            valueKg={entry.incrementKg}
            unit={weightUnit}
            hint="Blank uses the default for this body part."
            error={fieldError("incrementKg")}
          />
        )}
        {mode === "reps" && (
          <NumberField
            label="Target RPE"
            name="targetRpe"
            entryId={id}
            value={entry.targetRpe}
            hint="e.g. 8. Loads are then set automatically from your recent e1RM so the reps land at this effort."
            error={fieldError("targetRpe")}
          />
        )}
        {mode === "reps" && (
          <FormField
            label="Loading scheme"
            htmlFor={`entry-${id}-scheme`}
            hint="5/3/1 schemes need an active 5/3/1 program and a training max for this lift; otherwise the standard rules apply."
          >
            <select name="scheme" defaultValue={entry.scheme} className={selectClass}>
              {LOADING_SCHEMES.map((s) => (
                <option key={s} value={s}>
                  {LOADING_SCHEME_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField
          label="Notes"
          htmlFor={`entry-${id}-notes`}
          className="sm:col-span-2"
          error={fieldError("notes")}
        >
          <Input name="notes" maxLength={500} defaultValue={entry.notes ?? ""} />
        </FormField>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="default" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save exercise"}
        </Button>
        <Button type="button" size="sm" onClick={onDone}>
          Cancel
        </Button>
        {state.error && (
          <span role="alert" className="text-destructive text-sm">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
