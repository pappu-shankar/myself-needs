"use client";

import { useActionState, useState } from "react";
import {
  deleteTrainingMaxAction,
  setTrainingMaxAction,
  type SetTrainingMaxState,
} from "@/modules/health/actions/gym/programs";
import { formatWeight, fromDisplayWeight, toDisplayWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/gym-types";
import type { TrainingMax } from "@/modules/health";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ExercisePicker } from "../_components/exercise-picker";
import { suggestTrainingMaxAction } from "@/modules/health/actions/gym/exercise-search";
import { ConfirmDeleteButton } from "./confirm-delete-button";

export interface LiftOption {
  id: number;
  name: string;
}

export interface TmSuggestion {
  e1rmKg: number;
  tmKg: number;
}

const initialState: SetTrainingMaxState = {};

function TrainingMaxForm({
  lifts,
  suggestions,
  today,
  weightUnit,
}: {
  lifts: LiftOption[];
  suggestions: Record<number, TmSuggestion>;
  today: string;
  weightUnit: WeightUnit;
}) {
  const [state, formAction, pending] = useActionState(setTrainingMaxAction, initialState);
  const [extras, setExtras] = useState<LiftOption[]>([]);
  const [selected, setSelected] = useState<string>(lifts[0] ? String(lifts[0].id) : "");
  const [weightText, setWeightText] = useState("");
  const [note, setNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedSuggestions, setPickedSuggestions] = useState<Record<number, TmSuggestion>>({});
  useActionSuccess(state, () => {
    setWeightText("");
    setNote("");
  });

  const options = [...lifts, ...extras.filter((e) => !lifts.some((l) => l.id === e.id))];
  const suggestion = selected
    ? (suggestions[Number(selected)] ?? pickedSuggestions[Number(selected)])
    : undefined;
  const typed = Number.parseFloat(weightText);
  // Actions only take kg: the visible field is in the display unit, the hidden one carries kg.
  const trainingMaxKg = Number.isFinite(typed)
    ? String(Math.round(fromDisplayWeight(typed, weightUnit) * 1000) / 1000)
    : "";
  const err = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField
          label="Exercise"
          htmlFor="tm-exercise"
          hint="Lifts used by 5/3/1 exercises in your routines."
          error={err("exerciseId")}
        >
          <select
            name="exerciseId"
            required
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {options.length === 0 && <option value="">Pick an exercise…</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label={`Training max (${weightUnit})`}
          htmlFor="tm-kg"
          error={err("trainingMaxKg")}
        >
          <Input
            type="number"
            required
            min="0"
            step="any"
            inputMode="decimal"
            value={weightText}
            onChange={(e) => setWeightText(e.target.value)}
            className="tabular-nums"
          />
          <input type="hidden" name="trainingMaxKg" value={trainingMaxKg} />
        </FormField>
        <FormField label="Effective from" htmlFor="tm-from" error={err("effectiveFrom")}>
          <Input type="date" name="effectiveFrom" defaultValue={today} />
        </FormField>
        <FormField label="Note (optional)" htmlFor="tm-note" error={err("note")}>
          <Input
            name="note"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </div>
      {suggestion && (
        <p className="text-sm">
          Suggested:{" "}
          <strong className="tabular-nums">{formatWeight(suggestion.tmKg, weightUnit)}</strong> — 90
          % of your best recent e1RM ({formatWeight(suggestion.e1rmKg, weightUnit)}).{" "}
          <Button
            type="button"
            size="xs"
            onClick={() => setWeightText(String(toDisplayWeight(suggestion.tmKg, weightUnit)))}
          >
            Use suggestion
          </Button>
        </p>
      )}
      {selected && !suggestion && (
        <p className="text-muted-foreground text-sm">
          No recent logged sets for this lift, so there&apos;s no suggestion. A common start is 90 %
          of a rep max you could repeat with good form.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="default" disabled={pending || !selected}>
          {pending ? "Saving…" : "Set training max"}
        </Button>
        <Button type="button" onClick={() => setPickerOpen(true)}>
          Pick another exercise
        </Button>
        {state.ok && (
          <span role="status" className="text-sm">
            Training max saved.
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-destructive text-sm">
            {state.error}
          </span>
        )}
      </div>
      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Pick a lift"
        description="Choose any exercise to give it a training max."
        onPick={(exercise) => {
          setExtras((prev) =>
            prev.some((p) => p.id === exercise.id)
              ? prev
              : [...prev, { id: exercise.id, name: exercise.name }],
          );
          setSelected(String(exercise.id));
          setPickerOpen(false);
          if (!suggestions[exercise.id]) {
            void suggestTrainingMaxAction({ exerciseId: exercise.id }).then((result) => {
              const data = result.ok ? result.data : null;
              if (data) setPickedSuggestions((prev) => ({ ...prev, [exercise.id]: data }));
            });
          }
        }}
      />
    </form>
  );
}

function TrainingMaxRow({
  tm,
  history,
  weightUnit,
}: {
  tm: TrainingMax;
  history: TrainingMax[];
  weightUnit: WeightUnit;
}) {
  const fmt = (kg: number) => formatWeight(kg, weightUnit);
  return (
    <li className="border-border border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{tm.exerciseName}</p>
          <p className="text-muted-foreground text-sm tabular-nums">
            <strong className="text-foreground">{fmt(tm.trainingMaxKg)}</strong> since{" "}
            {tm.effectiveFrom}
            {tm.note ? ` · ${tm.note}` : ""}
          </p>
        </div>
        <ConfirmDeleteButton
          label={`Delete training max for ${tm.exerciseName} from ${tm.effectiveFrom}`}
          title="Delete this training max?"
          description={`Removes ${fmt(tm.trainingMaxKg)} for ${tm.exerciseName} effective ${tm.effectiveFrom}. An earlier value, if any, applies again.`}
          onConfirm={() => deleteTrainingMaxAction({ id: tm.id })}
        />
      </div>
      {history.length > 1 && (
        <details className="mt-2 text-sm">
          <summary className="text-primary cursor-pointer">History ({history.length})</summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <span className="tabular-nums">
                  {h.effectiveFrom} — {fmt(h.trainingMaxKg)}
                  {h.note ? ` · ${h.note}` : ""}
                </span>
                {h.id !== tm.id && (
                  <ConfirmDeleteButton
                    label={`Delete training max ${fmt(h.trainingMaxKg)} from ${h.effectiveFrom}`}
                    title="Delete this training max?"
                    description={`Removes ${fmt(h.trainingMaxKg)} for ${h.exerciseName} effective ${h.effectiveFrom}.`}
                    onConfirm={() => deleteTrainingMaxAction({ id: h.id })}
                  />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

interface TrainingMaxSectionProps {
  latest: TrainingMax[];
  /** All maxes per exercise id, newest first. */
  history: Record<number, TrainingMax[]>;
  lifts: LiftOption[];
  suggestions: Record<number, TmSuggestion>;
  today: string;
  weightUnit: WeightUnit;
}

export function TrainingMaxSection({
  latest,
  history,
  lifts,
  suggestions,
  today,
  weightUnit,
}: TrainingMaxSectionProps) {
  return (
    <div className="grid gap-6">
      {latest.length === 0 ? (
        <EmptyState
          title="No training maxes yet"
          description="5/3/1 exercises need a training max to prescribe loads. Set one below."
        />
      ) : (
        <Card className="px-4">
          <ul className="m-0 list-none p-0">
            {latest.map((tm) => (
              <TrainingMaxRow
                key={tm.id}
                tm={tm}
                history={history[tm.exerciseId] ?? [tm]}
                weightUnit={weightUnit}
              />
            ))}
          </ul>
        </Card>
      )}
      <Card className="px-4">
        <TrainingMaxForm
          lifts={lifts}
          suggestions={suggestions}
          today={today}
          weightUnit={weightUnit}
        />
      </Card>
    </div>
  );
}
