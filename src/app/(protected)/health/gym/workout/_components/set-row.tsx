"use client";

import { useId, useState } from "react";
import { Calculator, Check, Ellipsis, Trash2 } from "lucide-react";
import type { WorkoutDetailEntry, WorkoutSet } from "@/modules/health";
import {
  SET_KINDS,
  SET_KIND_LABELS,
  type EffortScale,
  type ExerciseMode,
  type SetKind,
  type WeightUnit,
} from "@/modules/health/types";
import type { ExerciseSession, SetRecord } from "@/modules/health/engine/types";
import { formatWeight } from "@/modules/health/engine/units";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  effortOn,
  effortOptions,
  fieldsFor,
  requiredField,
  type FieldSpec,
  type SetField,
} from "../_lib/set-input";
import { formatSetBrief, previousSetFor } from "../_lib/history";
import { setLabels, speedAndPace } from "../_lib/format";
import type { ActionResult, CompleteExtras, SetValues } from "../_hooks/use-workout-sets";

/**
 * Editable set rows, shared by the live logger and history editing. Typing
 * stays local; a field saves when it loses focus, the effort picker and set
 * type save on change, and ✓ logs the set with whatever is on screen (an
 * empty field falls back to last session's value shown as its placeholder).
 */

const GRID_WITH_EFFORT =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_2.5rem_2.5rem] items-center gap-1.5";
const GRID_NO_EFFORT =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem_2.5rem] items-center gap-1.5";

const KIND_BADGE: Partial<Record<SetKind, "secondary" | "outline" | "default">> = {
  warmup: "secondary",
  amrap: "default",
  drop: "outline",
  failure: "outline",
};

type Edits = Partial<Record<SetField, string>>;

export interface SetHandlers {
  onSave: (setId: number, values: SetValues) => Promise<ActionResult>;
  onComplete: (
    set: WorkoutSet,
    values: SetValues,
    extras?: CompleteExtras,
  ) => Promise<ActionResult>;
  onUncomplete: (setId: number) => void;
  onDelete: (setId: number) => void;
  /** Opens the plate calculator for a weight (barbell work only). */
  onPlates?: (weightKg: number) => void;
}

interface SetListProps extends SetHandlers {
  entry: Pick<WorkoutDetailEntry, "id" | "mode" | "isBodyweight" | "sets">;
  effortScale: EffortScale;
  /** Last time's session, for "Last: …" and placeholders; omit in history. */
  previousSession?: ExerciseSession | null;
  /** Error messages keyed `set:<id>`. */
  errors: Record<string, string>;
  /** Display/input unit for weights; values stay kg. */
  weightUnit?: WeightUnit;
}

/** Column headings + one row per set. */
export function SetList({
  entry,
  effortScale,
  previousSession = null,
  errors,
  weightUnit = "kg",
  ...handlers
}: SetListProps) {
  const fields = fieldsFor(entry.mode, entry.isBodyweight, weightUnit);
  const showEffort = effortScale !== "none";
  const labels = setLabels(entry.sets);
  if (entry.sets.length === 0) {
    return <p className="text-muted-foreground text-sm">No sets yet — add one below.</p>;
  }
  return (
    <div>
      <div
        aria-hidden="true"
        className={cn(
          showEffort ? GRID_WITH_EFFORT : GRID_NO_EFFORT,
          "text-muted-foreground px-1 pb-1 text-center text-xs font-medium",
        )}
      >
        <span>Set</span>
        <span>{fields[0].column}</span>
        <span>{fields[1].column}</span>
        {showEffort && <span>{effortScale.toUpperCase()}</span>}
        <span>Done</span>
        <span />
      </div>
      <ol className="flex flex-col gap-1">
        {entry.sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            label={labels[index].label}
            name={labels[index].name}
            mode={entry.mode}
            isBodyweight={entry.isBodyweight}
            fields={fields}
            weightUnit={weightUnit}
            effortScale={effortScale}
            previous={previousSetFor(previousSession, entry.sets, index)}
            error={errors[`set:${set.id}`]}
            {...handlers}
          />
        ))}
      </ol>
    </div>
  );
}

interface SetRowProps extends SetHandlers {
  set: WorkoutSet;
  label: string;
  name: string;
  mode: ExerciseMode;
  isBodyweight: boolean;
  fields: [FieldSpec, FieldSpec];
  weightUnit: WeightUnit;
  effortScale: EffortScale;
  previous: SetRecord | null;
  error?: string;
}

function SetRow({
  set,
  label,
  name,
  mode,
  isBodyweight,
  fields,
  weightUnit,
  effortScale,
  previous,
  error,
  onSave,
  onComplete,
  onUncomplete,
  onDelete,
  onPlates,
}: SetRowProps) {
  const [edits, setEdits] = useState<Edits>({});
  const [fieldErrors, setFieldErrors] = useState<Edits>({});
  const errorId = useId();

  const textOf = (spec: FieldSpec) => edits[spec.field] ?? spec.format(set[spec.field]);

  /** Drops an edit once saved — unless the user has typed something newer since. */
  function dropEdits(saved: Edits) {
    setEdits((prev) => {
      const next = { ...prev };
      for (const [field, text] of Object.entries(saved) as [SetField, string][]) {
        if (next[field] === text) delete next[field];
      }
      return next;
    });
  }

  function commit(spec: FieldSpec) {
    const text = edits[spec.field];
    if (text === undefined) return;
    const parsed = spec.parse(text);
    if (!parsed.ok) {
      setFieldErrors((prev) => ({ ...prev, [spec.field]: parsed.error }));
      return;
    }
    // Weights compare as shown: retyping "220.5" lb must not nudge a stored 100 kg.
    const unchanged =
      spec.field === "weightKg"
        ? spec.format(parsed.value) === spec.format(set.weightKg)
        : parsed.value === set[spec.field];
    if (unchanged) {
      dropEdits({ [spec.field]: text });
      return;
    }
    void onSave(set.id, { [spec.field]: parsed.value }).then((result) => {
      if (result.ok) dropEdits({ [spec.field]: text });
    });
  }

  function complete() {
    const values: SetValues = {};
    const problems: Edits = {};
    for (const spec of fields) {
      const text = edits[spec.field];
      // Untouched fields send the stored value as is (a round trip through the
      // display unit would shift it by a few grams).
      if (text === undefined) {
        values[spec.field] = set[spec.field] ?? previous?.[spec.field] ?? null;
        continue;
      }
      const parsed = spec.parse(text);
      if (!parsed.ok) {
        problems[spec.field] = parsed.error;
        continue;
      }
      values[spec.field] = parsed.value ?? previous?.[spec.field] ?? null;
    }
    const required = requiredField(mode);
    const hasAmount = values[required] != null || (mode === "cardio" && values.distanceKm != null);
    if (!problems[required] && !hasAmount) {
      problems[required] =
        mode === "reps" ? "Enter the reps you did first." : "Enter how long it took first.";
    }
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const sent = { ...edits };
    void onComplete(set, values).then((result) => {
      if (result.ok) dropEdits(sent);
    });
  }

  function saveEffort(raw: string) {
    const value = raw === "" ? null : Number(raw);
    if (effortScale === "none") return;
    void onSave(
      set.id,
      effortScale === "rir" ? { rir: value, rpe: null } : { rpe: value, rir: null },
    );
  }

  const weightSpec = fields.find((spec) => spec.field === "weightKg");
  const typedWeight = weightSpec ? weightSpec.parse(textOf(weightSpec)) : null;
  const currentWeight =
    typedWeight?.ok && typedWeight.value !== null
      ? typedWeight.value
      : (previous?.weightKg ?? null);
  const canPlate =
    Boolean(onPlates) && !isBodyweight && currentWeight !== null && currentWeight > 0;

  const effort = effortScale === "none" ? null : effortOn(effortScale, set);
  const problemText = Object.values(fieldErrors).filter(Boolean).join(" ");
  const messages = [problemText, error].filter(Boolean).join(" ");
  const pace =
    mode === "cardio" && set.completed ? speedAndPace(set.distanceKm, set.durationSec) : null;
  const showMeta =
    set.kind !== "working" ||
    previous !== null ||
    pace !== null ||
    set.trackedBy === "camera" ||
    messages !== "";

  return (
    <li
      className={cn(
        "rounded-lg px-1 py-1 transition-colors",
        set.completed ? "bg-primary/10" : "bg-transparent",
      )}
    >
      <div className={effortScale !== "none" ? GRID_WITH_EFFORT : GRID_NO_EFFORT}>
        <span
          aria-hidden="true"
          className={cn(
            "text-center text-sm font-semibold tabular-nums",
            set.completed ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {fields.map((spec) => (
          <Input
            key={spec.field}
            type="text"
            inputMode={spec.inputMode}
            enterKeyHint="done"
            autoComplete="off"
            aria-label={`${name} ${spec.label}`}
            aria-invalid={fieldErrors[spec.field] ? true : undefined}
            aria-describedby={messages ? errorId : undefined}
            value={textOf(spec)}
            placeholder={previous ? spec.format(previous[spec.field]) : undefined}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const text = e.target.value;
              setEdits((prev) => ({ ...prev, [spec.field]: text }));
              if (fieldErrors[spec.field]) {
                setFieldErrors((prev) => ({ ...prev, [spec.field]: undefined }));
              }
            }}
            onBlur={() => commit(spec)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-10 px-1 text-center tabular-nums"
          />
        ))}
        {effortScale !== "none" && (
          <select
            aria-label={`${name} ${effortScale === "rir" ? "reps in reserve" : "RPE"}`}
            value={effort === null ? "" : String(effort)}
            onChange={(e) => saveEffort(e.target.value)}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full min-w-0 rounded-lg border px-0.5 text-center text-base tabular-nums outline-none focus-visible:ring-3 md:text-sm"
          >
            <option value="">–</option>
            {effortOptions(effortScale, effort).map((option) => (
              <option key={option} value={String(option)}>
                {option}
              </option>
            ))}
          </select>
        )}
        <Button
          type="button"
          variant={set.completed ? "default" : "outline"}
          size="icon"
          className="size-10"
          aria-pressed={set.completed}
          aria-label={`${name} done`}
          onClick={() => (set.completed ? onUncomplete(set.id) : complete())}
        >
          <Check className="size-5" aria-hidden="true" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label={`${name} options`}
              />
            }
          >
            <Ellipsis aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {canPlate && (
              <>
                <DropdownMenuItem onClick={() => onPlates?.(currentWeight!)}>
                  <Calculator aria-hidden="true" />
                  Plates for {formatWeight(currentWeight!, weightUnit)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Set type</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={set.kind}
                onValueChange={(kind) => void onSave(set.id, { kind: kind as SetKind })}
              >
                {SET_KINDS.map((kind) => (
                  <DropdownMenuRadioItem key={kind} value={kind}>
                    {SET_KIND_LABELS[kind]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(set.id)}>
              <Trash2 aria-hidden="true" />
              Delete set
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showMeta && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 pl-[2.125rem] text-xs">
          {set.kind !== "working" && (
            <Badge variant={KIND_BADGE[set.kind] ?? "outline"}>{SET_KIND_LABELS[set.kind]}</Badge>
          )}
          {pace && <span className="tabular-nums">{pace}</span>}
          {previous && (
            <span className="tabular-nums">
              Last: {formatSetBrief(previous, mode, isBodyweight, { weightUnit })}
            </span>
          )}
          {set.trackedBy === "camera" && (
            <span className="tabular-nums">
              Counted by camera
              {set.romScore !== null ? ` · ROM ${Math.round(set.romScore)}%` : ""}
            </span>
          )}
          {messages && (
            <span id={errorId} role="alert" className="text-destructive">
              {messages}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
