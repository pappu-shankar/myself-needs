import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session/guard";
import { buildSessionPlan, getGymSettings, getRoutine, type RoutineDetail } from "@/modules/health";
import { DomainError } from "@/modules/core/errors";
import { muscleLevels, muscleLoad, musclesOf } from "@/modules/health/engine/muscles";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BodyMap } from "../../_components/body-map";
import { RoutineActions } from "../routine-actions";
import { SessionPreview, type PreviewEntry } from "../session-preview";
import { AddExerciseButton } from "./add-exercise-button";
import { EntryList } from "./entry-list";
import { RoutineHeaderForm } from "./routine-header-form";
import { StartWorkoutButton } from "./start-workout-button";

export const metadata: Metadata = {
  title: "Edit routine — Gym — Personal Life OS",
};

function loadRoutine(id: number): RoutineDetail | null {
  try {
    return getRoutine(id);
  } catch (err) {
    if (err instanceof DomainError) return null;
    throw err;
  }
}

export default async function RoutineEditorPage({
  params,
}: {
  params: Promise<{ routineId: string }>;
}) {
  await requireUser();
  const { routineId: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const routine = loadRoutine(id);
  if (!routine) notFound();

  const { weightUnit } = getGymSettings();
  const archived = Boolean(routine.archivedAt);
  let previewEntries: PreviewEntry[] = [];
  let levels: ReturnType<typeof muscleLevels> | null = null;
  let previewError: string | null = null;
  if (!archived && routine.entries.length > 0) {
    try {
      const plan = buildSessionPlan(routine.id);
      previewEntries = plan.entries.map((p) => ({
        id: p.entry.id,
        name: p.entry.exercise.name,
        mode: p.plan.mode,
        isBodyweight: p.plan.isBodyweight,
        sets: p.sets,
        reason: p.prescription.reason,
      }));
      levels = muscleLevels(
        muscleLoad(
          plan.entries.map((p) => ({
            muscles: musclesOf(p.entry.exercise),
            sets: p.sets.filter((s) => s.kind !== "warmup").length,
          })),
        ),
      );
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      previewError = err.message;
    }
  }

  return (
    <>
      <PageHeader
        title={routine.name}
        description="Edit the routine, reorder exercises and preview the next session."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {archived && <Badge variant="secondary">Archived</Badge>}
            <Link
              href="/health/gym/routines"
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              All routines
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className="mb-3 text-lg font-medium">
            Details
          </h2>
          <RoutineHeaderForm
            key={`${routine.name}|${routine.notes}|${routine.progressionPolicy}`}
            id={routine.id}
            name={routine.name}
            notes={routine.notes}
            progressionPolicy={routine.progressionPolicy}
          />
          <div className="mt-4">
            <RoutineActions
              id={routine.id}
              name={routine.name}
              archived={archived}
              afterDelete="/health/gym/routines"
            />
          </div>
        </section>

        <section aria-labelledby="exercises-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="exercises-heading" className="text-lg font-medium">
              Exercises
            </h2>
            <AddExerciseButton routineId={routine.id} />
          </div>
          {routine.entries.length === 0 ? (
            <EmptyState
              title="No exercises yet"
              description="Add an exercise to build this routine."
            />
          ) : (
            <EntryList
              routineId={routine.id}
              entries={routine.entries}
              routinePolicy={routine.progressionPolicy}
              weightUnit={weightUnit}
            />
          )}
        </section>

        <section aria-labelledby="preview-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="preview-heading" className="text-lg font-medium">
              Next session preview
            </h2>
            {!archived && routine.entries.length > 0 && (
              <StartWorkoutButton routineId={routine.id} />
            )}
          </div>
          {archived ? (
            <p className="text-muted-foreground text-sm">
              Restore this routine to preview or start it.
            </p>
          ) : previewError ? (
            <p role="alert" className="text-destructive text-sm">
              {previewError}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
              <Card className="px-4">
                <SessionPreview entries={previewEntries} weightUnit={weightUnit} />
              </Card>
              {levels && (
                <div className="lg:w-80">
                  <BodyMap levels={levels} title="Muscles this routine trains" />
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
