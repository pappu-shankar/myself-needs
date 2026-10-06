"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  Camera,
  Ellipsis,
  Flame,
  Info,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import type { GymSettings, WorkoutDetailEntry, WorkoutSet } from "@/modules/health";
import type { ExerciseSession, PersonalRecord } from "@/modules/health/engine/types";
import { formatDuration } from "@/modules/health/engine/units";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { capitalize, recordLabel, setLabels, targetSummary } from "../_lib/format";
import { lastPerformedSession } from "../_lib/history";
import { SetList, type SetHandlers } from "./set-row";
import { HoldTimer } from "./hold-timer";

type LoggerSettings = Pick<
  GymSettings,
  "effortScale" | "restSound" | "barWeightKg" | "defaultRestSec" | "weightUnit"
>;

interface EntryCardProps extends SetHandlers {
  entry: WorkoutDetailEntry;
  history: ExerciseSession[];
  /** PRs this session has set so far (live, from completed sets). */
  records: PersonalRecord[];
  settings: LoggerSettings;
  errors: Record<string, string>;
  isFirst: boolean;
  isLast: boolean;
  onAddSet: () => void;
  addingSet: boolean;
  onAddWarmups: () => void;
  onCamera: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/** One exercise in the live session: what was prescribed and why, its sets, its tools. */
export function EntryCard({
  entry,
  history,
  records,
  settings,
  errors,
  isFirst,
  isLast,
  onAddSet,
  addingSet,
  onAddWarmups,
  onCamera,
  onMove,
  onRemove,
  ...handlers
}: EntryCardProps) {
  const name = capitalize(entry.exercise.name);
  const target = entry.target
    ? targetSummary(entry.target, {
        perSide: entry.perSide,
        isBodyweight: entry.isBodyweight,
        weightUnit: settings.weightUnit,
      })
    : null;
  const rest = entry.restSec ?? settings.defaultRestSec;
  const previousSession = lastPerformedSession(history);
  const labels = setLabels(entry.sets);
  const nextOpenIndex = entry.sets.findIndex((s) => !s.completed);
  const nextOpen: WorkoutSet | null = nextOpenIndex >= 0 ? entry.sets[nextOpenIndex] : null;
  const nextName = nextOpenIndex >= 0 ? labels[nextOpenIndex].name.toLowerCase() : null;
  const hasWarmups = entry.sets.some((s) => s.kind === "warmup");
  const canWarmUp = entry.mode === "reps" && !entry.isBodyweight && !hasWarmups;
  const canPlate = entry.mode !== "cardio" && !entry.isBodyweight;
  const topWeight = Math.max(0, ...entry.sets.map((s) => s.weightKg ?? 0));
  const errorKey = `entry:${entry.id}`;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base leading-snug font-medium">
            <Link
              href={`/health/gym/library/${entry.exerciseId}`}
              className="underline-offset-4 hover:underline"
            >
              {name}
            </Link>
          </h2>
        </CardTitle>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-mt-1 -mr-1 size-10"
                  aria-label={`${name} options`}
                />
              }
            >
              <Ellipsis aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {canWarmUp && (
                <DropdownMenuItem onClick={onAddWarmups}>
                  <Flame aria-hidden="true" />
                  Add warm-up sets
                </DropdownMenuItem>
              )}
              {canPlate && topWeight > 0 && handlers.onPlates && (
                <DropdownMenuItem onClick={() => handlers.onPlates?.(topWeight)}>
                  <Calculator aria-hidden="true" />
                  Plate calculator
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={isFirst} onClick={() => onMove(-1)}>
                <ArrowUp aria-hidden="true" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLast} onClick={() => onMove(1)}>
                <ArrowDown aria-hidden="true" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                <Trash2 aria-hidden="true" />
                Remove exercise
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(target || entry.prescriptionReason || entry.notes) && (
          <div className="flex flex-col gap-1 text-sm">
            {target && (
              <p className="tabular-nums">
                <span className="text-muted-foreground">Target </span>
                <span className="font-medium">{target}</span>
                {rest > 0 && (
                  <span className="text-muted-foreground"> · rest {formatDuration(rest)}</span>
                )}
              </p>
            )}
            {entry.prescriptionReason && (
              <p className="text-muted-foreground flex gap-1.5 text-xs">
                <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="sr-only">Why: </span>
                  {entry.prescriptionReason}
                </span>
              </p>
            )}
            {entry.notes && <p className="text-muted-foreground text-xs italic">{entry.notes}</p>}
          </div>
        )}

        <div role="status" aria-live="polite">
          {records.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="New personal records">
              {records.map((record) => (
                <li key={`${record.type}-${record.context}`}>
                  <Badge className="h-6 tabular-nums">
                    <Trophy aria-hidden="true" />
                    New PR · {recordLabel(record, settings.weightUnit)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SetList
          entry={entry}
          effortScale={settings.effortScale}
          weightUnit={settings.weightUnit}
          previousSession={previousSession}
          errors={errors}
          {...handlers}
        />

        {errors[errorKey] && (
          <p role="alert" className="text-destructive text-sm">
            {errors[errorKey]}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={addingSet}
            onClick={onAddSet}
          >
            <Plus aria-hidden="true" />
            {addingSet ? "Adding…" : "Add set"}
          </Button>
          {entry.mode === "reps" && (
            <Button type="button" variant="outline" className="h-10" onClick={onCamera}>
              <Camera aria-hidden="true" />
              Count with camera
            </Button>
          )}
          {entry.mode === "time" && (
            <HoldTimer
              setName={nextName}
              targetSec={nextOpen?.durationSec ?? entry.target?.durationSec ?? null}
              sound={settings.restSound}
              onDone={(seconds) => {
                if (nextOpen) void handlers.onComplete(nextOpen, { durationSec: seconds });
              }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
