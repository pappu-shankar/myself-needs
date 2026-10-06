"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Ellipsis, Link2, Plus, Trash2 } from "lucide-react";
import type { GymSettings, WorkoutDetail, WorkoutDetailEntry, WorkoutSet } from "@/modules/health";
import type { ExerciseSession, PersonalRecord, SetRecord } from "@/modules/health/engine/types";
import { newRecords } from "@/modules/health/engine/records";
import { formatDuration } from "@/modules/health/engine/units";
import { addWorkoutEntryAction, discardWorkoutAction } from "@/modules/health/actions/gym/workouts";
import { addWarmupSetsAction } from "@/modules/health/actions/gym/session";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExercisePicker } from "../_components/exercise-picker";
import type { RepCounterResult } from "../_components/camera/rep-counter-panel";
import { capitalize, elapsedSec, guessMovement, setLabels } from "./_lib/format";
import { restSecondsFor, shouldRestAfter, supersetBlocks } from "./_lib/rest";
import { useWorkoutSets, type CompleteExtras, type SetValues } from "./_hooks/use-workout-sets";
import { useWakeLock } from "./_hooks/use-wake-lock";
import { useNow } from "./_hooks/clock";
import { beginRest, getRest, setRest } from "./_hooks/rest-timer-store";
import { primeAlerts } from "./_hooks/alerts";
import { EntryCard } from "./_components/entry-card";
import { RestBar } from "./_components/rest-bar";
import { FinishDialog } from "./_components/finish-dialog";
import { ConfirmDialog } from "./_components/confirm-dialog";
import { PlateDialog } from "./_components/plate-dialog";
import { CameraDialog } from "./_components/camera-dialog";

interface WorkoutLoggerProps {
  workout: WorkoutDetail;
  /** Per exercise id: condensed past sessions (oldest first). */
  histories: Record<number, ExerciseSession[]>;
  settings: GymSettings;
}

function toRecord(set: WorkoutSet): SetRecord {
  return {
    kind: set.kind,
    weightKg: set.weightKg,
    reps: set.reps,
    durationSec: set.durationSec,
    distanceKm: set.distanceKm,
    rir: set.rir,
    rpe: set.rpe,
    completed: set.completed,
  };
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useNow();
  return (
    <span>
      <span className="sr-only">Elapsed </span>
      {now === 0 ? "–:––" : formatDuration(elapsedSec(startedAt, now))}
    </span>
  );
}

/**
 * The live session. Everything typed stays on the phone until a field loses
 * focus or a set is ticked; ticks are optimistic and roll back with an
 * inline error if the save fails. Resumable: the server holds every saved
 * set and the rest timer survives a reload.
 */
export function WorkoutLogger({ workout, histories, settings }: WorkoutLoggerProps) {
  const router = useRouter();
  const sets = useWorkoutSets(workout.entries);
  useWakeLock(settings.keepAwake);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [removing, setRemoving] = useState<WorkoutDetailEntry | null>(null);
  const [plateWeight, setPlateWeight] = useState<number | null>(null);
  const [cameraEntryId, setCameraEntryId] = useState<number | null>(null);
  const [addingEntryId, setAddingEntryId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();

  const entries = sets.entries;
  const work = entries.flatMap((e) => e.sets.filter((s) => s.kind !== "warmup"));
  const done = work.filter((s) => s.completed).length;
  const cameraEntry = entries.find((e) => e.id === cameraEntryId) ?? null;

  /** Live PRs per exercise: today's sets (all entries of it) against everything before. */
  const recordsByExercise = new Map<number, PersonalRecord[]>();
  for (const entry of entries) {
    if (recordsByExercise.has(entry.exerciseId)) continue;
    const history = histories[entry.exerciseId] ?? [];
    if (history.length === 0) {
      recordsByExercise.set(entry.exerciseId, []);
      continue;
    }
    const same = entries.filter((e) => e.exerciseId === entry.exerciseId);
    const session: ExerciseSession = {
      workoutId: workout.id,
      date: workout.date,
      target: entry.target,
      sets: same.flatMap((e) => e.sets.map(toRecord)),
    };
    recordsByExercise.set(
      entry.exerciseId,
      newRecords(entry.exerciseId, history, session, {
        formula: settings.e1rmFormula,
        mode: entry.mode,
        isBodyweight: entry.isBodyweight,
        weightUnit: settings.weightUnit,
      }),
    );
  }

  /** Ticking a set: start the rest (unless mid-superset), then save optimistically. */
  function completeSet(
    entry: WorkoutDetailEntry,
    set: WorkoutSet,
    values: SetValues,
    extras?: CompleteExtras,
  ) {
    primeAlerts({ sound: settings.restSound, notifications: settings.restNotifications });
    const rest = shouldRestAfter(entries, entry.id)
      ? beginRest(workout.id, set.id, restSecondsFor(entry, settings.defaultRestSec))
      : null;
    const saving = sets.completeSet(set.id, values, extras);
    void saving.then((result) => {
      if (!result.ok && rest && getRest()?.setId === set.id) setRest(null);
    });
    return saving;
  }

  function addExercise(exerciseId: number, name: string) {
    setNotice(null);
    startAdding(async () => {
      try {
        const result = await addWorkoutEntryAction({ workoutId: workout.id, exerciseId });
        if (!result.ok) setNotice(result.error ?? `Couldn't add ${name}.`);
      } catch {
        setNotice("Couldn't reach the app — the exercise wasn't added. Try again.");
      }
    });
  }

  function addSet(entryId: number) {
    setAddingEntryId(entryId);
    void sets.addSet(entryId).finally(() => setAddingEntryId(null));
  }

  function addWarmups(entry: WorkoutDetailEntry) {
    setNotice(null);
    startAdding(async () => {
      try {
        const result = await addWarmupSetsAction({ entryId: entry.id });
        if (!result.ok) setNotice(result.error ?? "Couldn't add warm-up sets.");
      } catch {
        setNotice("Couldn't reach the app — no warm-ups were added. Try again.");
      }
    });
  }

  async function countedByCamera(entry: WorkoutDetailEntry, result: RepCounterResult) {
    if (result.reps <= 0) return;
    const values: SetValues = { reps: result.reps };
    const extras: CompleteExtras = {
      trackedBy: "camera",
      romScore:
        result.avgRomScore === null
          ? null
          : Math.min(100, Math.max(0, Math.round(result.avgRomScore))),
    };
    const open = entry.sets.find((s) => !s.completed);
    if (open) {
      void completeSet(entry, open, values, extras);
      return;
    }
    // Every set was done — log the counted one as an extra set.
    const added = await sets.addSet(entry.id, values);
    const set = added.data as WorkoutSet | undefined;
    if (added.ok && set) void completeSet(entry, set, values, extras);
  }

  async function discard(): Promise<string | null> {
    const result = await discardWorkoutAction({ workoutId: workout.id });
    if (!result.ok) return result.error ?? "The workout couldn't be discarded.";
    setRest(null);
    router.refresh();
    return null;
  }

  async function removeEntry(entry: WorkoutDetailEntry): Promise<string | null> {
    const result = await sets.removeEntry(entry.id);
    return result.ok ? null : (result.error ?? "The exercise couldn't be removed.");
  }

  function requestRemove(entry: WorkoutDetailEntry) {
    // Nothing logged yet → nothing to lose, so no confirmation.
    if (entry.sets.some((s) => s.completed)) setRemoving(entry);
    else void sets.removeEntry(entry.id);
  }

  const blocks = supersetBlocks(entries);
  const cameraNext = cameraEntry?.sets.findIndex((s) => !s.completed) ?? -1;
  const cameraSetName =
    cameraEntry && cameraNext >= 0
      ? setLabels(cameraEntry.sets)[cameraNext].name.toLowerCase()
      : "an extra set";
  const cameraTarget =
    cameraEntry && cameraNext >= 0
      ? (cameraEntry.sets[cameraNext].reps ?? cameraEntry.target?.reps ?? undefined)
      : (cameraEntry?.target?.reps ?? undefined);

  function card(entry: WorkoutDetailEntry) {
    const index = entries.indexOf(entry);
    return (
      <EntryCard
        key={entry.id}
        entry={entry}
        history={histories[entry.exerciseId] ?? []}
        records={recordsByExercise.get(entry.exerciseId) ?? []}
        settings={settings}
        errors={sets.errors}
        isFirst={index === 0}
        isLast={index === entries.length - 1}
        addingSet={addingEntryId === entry.id}
        onAddSet={() => addSet(entry.id)}
        onAddWarmups={() => addWarmups(entry)}
        onCamera={() => setCameraEntryId(entry.id)}
        onMove={(direction) => void sets.moveEntry(workout.id, entry.id, direction)}
        onRemove={() => requestRemove(entry)}
        onSave={sets.updateSet}
        onComplete={(set, values, extras) => completeSet(entry, set, values, extras)}
        onUncomplete={(setId) => void sets.uncompleteSet(setId)}
        onDelete={(setId) => void sets.deleteSet(setId)}
        onPlates={entry.isBodyweight ? undefined : (weightKg) => setPlateWeight(weightKg)}
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{workout.name}</h1>
          <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-2 text-sm tabular-nums">
            <Elapsed startedAt={workout.startedAt} />
            <span aria-hidden="true">·</span>
            <span>
              {done} / {work.length} sets
            </span>
            {sets.pending && <span>· Saving…</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="default"
            className="h-10 px-4"
            onClick={() => setFinishOpen(true)}
          >
            Finish
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label="Workout options"
                />
              }
            >
              <Ellipsis aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem variant="destructive" onClick={() => setDiscardOpen(true)}>
                <Trash2 aria-hidden="true" />
                Discard workout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {entries.length === 0 && (
          <EmptyState
            icon={Dumbbell}
            title="No exercises yet"
            description="Add the first exercise to start logging sets."
          />
        )}
        {blocks.map((block) =>
          block.group === null ? (
            card(block.entries[0])
          ) : (
            <section
              key={`superset-${block.entries[0].id}`}
              aria-label={`Superset: ${block.entries.map((e) => capitalize(e.exercise.name)).join(", ")}`}
              className="border-primary/40 flex flex-col gap-3 border-l-4 pl-2"
            >
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Link2 className="size-3.5" aria-hidden="true" />
                Superset — go straight to the next exercise, rest after the last
              </p>
              {block.entries.map(card)}
            </section>
          ),
        )}

        {notice && (
          <p role="alert" className="text-destructive text-sm">
            {notice}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={adding}
          onClick={() => setPickerOpen(true)}
        >
          <Plus aria-hidden="true" />
          {adding ? "Adding…" : "Add exercise"}
        </Button>
        <Button
          type="button"
          variant="default"
          className="h-11 w-full"
          onClick={() => setFinishOpen(true)}
        >
          Finish workout
        </Button>
        {/* Room so the rest bar never covers the last controls. */}
        <div className="h-20" aria-hidden="true" />
      </div>

      <RestBar
        workoutId={workout.id}
        sound={settings.restSound}
        notifications={settings.restNotifications}
      />

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(exercise) => addExercise(exercise.id, exercise.name)}
      />
      <FinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        workoutId={workout.id}
        setsDone={done}
        setsOpen={work.length - done}
      />
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard this workout?"
        description="Every set logged in this session is deleted. This can't be undone."
        confirmLabel="Discard workout"
        pendingLabel="Discarding…"
        cancelLabel="Keep it"
        onConfirm={discard}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing ? capitalize(removing.exercise.name) : "exercise"}?`}
        description="Its logged sets are deleted from this workout."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        onConfirm={() => (removing ? removeEntry(removing) : Promise.resolve(null))}
      />
      {plateWeight !== null && (
        <PlateDialog
          open
          onOpenChange={(open) => !open && setPlateWeight(null)}
          initialWeightKg={plateWeight}
          barKg={settings.barWeightKg}
          platesKg={settings.platesKg}
          weightUnit={settings.weightUnit}
        />
      )}
      <CameraDialog
        open={cameraEntry !== null}
        onOpenChange={(open) => !open && setCameraEntryId(null)}
        exerciseName={cameraEntry ? capitalize(cameraEntry.exercise.name) : ""}
        targetReps={cameraTarget ?? undefined}
        defaultMovement={cameraEntry ? guessMovement(cameraEntry.exercise.name) : undefined}
        setName={cameraSetName}
        voiceCoach={settings.voiceCoach}
        autoLog={settings.cameraAutoLog}
        onCounted={(result) => {
          if (cameraEntry) void countedByCamera(cameraEntry, result);
        }}
      />
    </>
  );
}
