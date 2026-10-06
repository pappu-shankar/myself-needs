"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { WorkoutDetailEntry } from "@/modules/health";
import {
  EXERCISE_MODE_LABELS,
  SET_KIND_LABELS,
  type EffortScale,
  type WeightUnit,
} from "@/modules/health/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useWorkoutSets } from "../../workout/_hooks/use-workout-sets";
import { SetList } from "../../workout/_components/set-row";
import { ConfirmDialog } from "../../workout/_components/confirm-dialog";
import { formatSetBrief } from "../../workout/_lib/history";
import { capitalize, setLabels, targetSummary } from "../../workout/_lib/format";
import { effortOn } from "../../workout/_lib/set-input";

interface HistoryEntriesProps {
  entries: WorkoutDetailEntry[];
  effortScale: EffortScale;
  weightUnit: WeightUnit;
}

function effortText(
  set: { rir: number | null; rpe: number | null },
  scale: EffortScale,
): string | null {
  if (scale !== "none") {
    const value = effortOn(scale, set);
    return value === null ? null : `${scale.toUpperCase()} ${value}`;
  }
  if (set.rir !== null) return `RIR ${set.rir}`;
  if (set.rpe !== null) return `RPE ${set.rpe}`;
  return null;
}

/**
 * Every exercise of a past workout with its sets — read-only by default,
 * "Edit sets" turns the lists into the same editable rows as the live logger
 * (save on blur, tick to mark done, delete), since history edits are allowed.
 */
export function HistoryEntries({ entries, effortScale, weightUnit }: HistoryEntriesProps) {
  const sets = useWorkoutSets(entries);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<WorkoutDetailEntry | null>(null);
  const [addingEntryId, setAddingEntryId] = useState<number | null>(null);

  function addSet(entryId: number) {
    setAddingEntryId(entryId);
    void sets.addSet(entryId).finally(() => setAddingEntryId(null));
  }

  return (
    <section aria-labelledby="history-exercises" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="history-exercises" className="text-lg font-semibold tracking-tight">
          Exercises
        </h2>
        <div className="flex items-center gap-3">
          {sets.pending && <span className="text-muted-foreground text-sm">Saving…</span>}
          <Button
            type="button"
            variant={editing ? "default" : "outline"}
            className="h-10"
            aria-pressed={editing}
            onClick={() => setEditing((on) => !on)}
          >
            <Pencil aria-hidden="true" />
            {editing ? "Done editing" : "Edit sets"}
          </Button>
        </div>
      </div>

      {sets.entries.length === 0 && (
        <p className="text-muted-foreground text-sm">No exercises were logged in this workout.</p>
      )}

      {sets.entries.map((entry) => {
        const name = capitalize(entry.exercise.name);
        const target = entry.target
          ? targetSummary(entry.target, {
              perSide: entry.perSide,
              isBodyweight: entry.isBodyweight,
              weightUnit,
            })
          : null;
        const labels = setLabels(entry.sets);
        const entryError = sets.errors[`entry:${entry.id}`];
        return (
          <Card key={entry.id} size="sm">
            <CardHeader>
              <CardTitle>
                <h3 className="text-base font-medium">
                  <Link
                    href={`/health/gym/library/${entry.exerciseId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {name}
                  </Link>
                </h3>
              </CardTitle>
              <CardDescription className="tabular-nums">
                {EXERCISE_MODE_LABELS[entry.mode]}
                {target ? ` · target ${target}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {editing ? (
                <>
                  <SetList
                    entry={entry}
                    effortScale={effortScale}
                    weightUnit={weightUnit}
                    errors={sets.errors}
                    onSave={sets.updateSet}
                    onComplete={(set, values, extras) => sets.completeSet(set.id, values, extras)}
                    onUncomplete={(setId) => void sets.uncompleteSet(setId)}
                    onDelete={(setId) => void sets.deleteSet(setId)}
                  />
                  {entryError && (
                    <p role="alert" className="text-destructive text-sm">
                      {entryError}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      disabled={addingEntryId === entry.id}
                      onClick={() => addSet(entry.id)}
                    >
                      <Plus aria-hidden="true" />
                      {addingEntryId === entry.id ? "Adding…" : "Add set"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive h-10"
                      onClick={() => setRemoving(entry)}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove exercise
                    </Button>
                  </div>
                </>
              ) : entry.sets.length === 0 ? (
                <p className="text-muted-foreground text-sm">No sets.</p>
              ) : (
                <ol className="flex flex-col gap-1.5 text-sm" aria-label={`${name} sets`}>
                  {entry.sets.map((set, index) => {
                    const effort = effortText(set, effortScale);
                    return (
                      <li
                        key={set.id}
                        className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline gap-2"
                      >
                        <span className="text-muted-foreground text-center font-medium tabular-nums">
                          <span aria-hidden="true">{labels[index].label}</span>
                          <span className="sr-only">{labels[index].name}:</span>
                        </span>
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span
                            className={cn(
                              "tabular-nums",
                              !set.completed && "text-muted-foreground line-through",
                            )}
                          >
                            {formatSetBrief(set, entry.mode, entry.isBodyweight, {
                              units: true,
                              weightUnit,
                            })}
                          </span>
                          {!set.completed && (
                            <span className="text-muted-foreground text-xs">not done</span>
                          )}
                          {set.kind !== "working" && set.kind !== "warmup" && (
                            <Badge variant="outline">{SET_KIND_LABELS[set.kind]}</Badge>
                          )}
                          {effort && (
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {effort}
                            </span>
                          )}
                          {set.trackedBy === "camera" && (
                            <span className="text-muted-foreground text-xs tabular-nums">
                              camera
                              {set.romScore !== null ? ` · ROM ${Math.round(set.romScore)}%` : ""}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        );
      })}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing ? capitalize(removing.exercise.name) : "exercise"}?`}
        description="It and its sets are deleted from this workout, and its records and stats update."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        onConfirm={async () => {
          if (!removing) return null;
          const result = await sets.removeEntry(removing.id);
          return result.ok ? null : (result.error ?? "The exercise couldn't be removed.");
        }}
      />
    </section>
  );
}
