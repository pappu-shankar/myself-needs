import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/modules/core/session/guard";
import {
  getExerciseOverview,
  getGymSettings,
  listEquipmentOptions,
  getExercise,
} from "@/modules/health";
import { formatWeight } from "@/modules/health/engine/units";
import { primaryMuscleOf } from "@/modules/health/engine/muscles";
import { MUSCLE_LABELS, EXERCISE_MODE_LABELS, type Muscle } from "@/modules/health/types";
import type { MuscleLevel } from "@/modules/health/engine/muscles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BodyMap } from "../../_components/body-map";
import { E1rmChart } from "../e1rm-chart";
import { ExerciseFormDialog } from "../exercise-form-dialog";
import { FavoriteButton } from "../favorite-button";
import { HistoryTable } from "../history-table";
import { capitalize, pageRange } from "../library-params";
import { NotesForm } from "../notes-form";
import { OneRmCalculator } from "../one-rm-calculator";
import { Pager } from "../pager";
import { RecordsCards } from "../records-cards";
import { RemoveExerciseButton } from "../remove-exercise-button";
import { RepMaxTable } from "../rep-max-table";

const HISTORY_PAGE_SIZE = 20;
const FORMULA_LABELS = { epley: "Epley", brzycki: "Brzycki", lombardi: "Lombardi" } as const;

function parseId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}): Promise<Metadata> {
  // generateMetadata can run before the page body, so it binds the scope itself.
  await requireUser();
  const id = parseId((await params).exerciseId);
  let name = "Exercise";
  if (id !== null) {
    try {
      name = capitalize(getExercise(id).name);
    } catch {
      // Unknown id: the page itself renders notFound().
    }
  }
  return { title: `${name} — Gym — Personal Life OS` };
}

export default async function ExerciseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const id = parseId((await params).exerciseId);
  if (id === null) notFound();
  const rawPage = (await searchParams).page;
  const parsedPage = Number.parseInt((Array.isArray(rawPage) ? rawPage[0] : rawPage) ?? "", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 1 ? Math.min(parsedPage, 10_000) : 1;

  let overview;
  try {
    overview = getExerciseOverview(id, {
      historyLimit: HISTORY_PAGE_SIZE,
      historyOffset: (page - 1) * HISTORY_PAGE_SIZE,
    });
  } catch {
    notFound();
  }
  const settings = getGymSettings();
  const { exercise, muscles, mode, records, e1rmSeries, repMaxes, history, trainingMaxes } =
    overview;
  const formulaLabel = FORMULA_LABELS[overview.formula];

  const primary = primaryMuscleOf(exercise);
  const levels: Partial<Record<Muscle, MuscleLevel>> = {};
  for (const [muscle, weight] of Object.entries(muscles) as [Muscle, number][]) {
    levels[muscle] = weight >= 1 ? 4 : 2;
  }
  const trainingMax = trainingMaxes[0];
  const { from, to, pages } = pageRange(page, HISTORY_PAGE_SIZE, history.total);
  const historyHref = (p: number) => `/health/gym/library/${id}${p > 1 ? `?page=${p}` : ""}`;
  const equipmentOptions = exercise.isCustom ? listEquipmentOptions().map((o) => o.equipment) : [];

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/health/gym/library"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Exercise library
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{capitalize(exercise.name)}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{capitalize(exercise.bodyPart)}</Badge>
              <Badge variant="secondary">{capitalize(exercise.equipment)}</Badge>
              <Badge variant="secondary">
                {primary ? MUSCLE_LABELS[primary] : capitalize(exercise.target)}
              </Badge>
              <Badge variant="outline">Logged as {EXERCISE_MODE_LABELS[mode].toLowerCase()}</Badge>
              {exercise.isCustom && <Badge variant="outline">Custom</Badge>}
              {exercise.isBodyweight && <Badge variant="outline">Bodyweight</Badge>}
              {exercise.isUnilateral && <Badge variant="outline">One side at a time</Badge>}
              {exercise.archivedAt && <Badge variant="destructive">Archived</Badge>}
            </div>
          </div>
          <FavoriteButton
            id={exercise.id}
            name={exercise.name}
            favorite={exercise.isFavorite}
            size="icon"
          />
        </div>
        {exercise.isCustom && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ExerciseFormDialog
              equipmentOptions={equipmentOptions}
              exercise={{
                id: exercise.id,
                name: exercise.name,
                bodyPart: exercise.bodyPart,
                equipment: exercise.equipment,
                target: exercise.target,
                secondaryMuscles: exercise.secondaryMuscles,
                defaultMode: exercise.defaultMode,
                isBodyweight: exercise.isBodyweight,
                isUnilateral: exercise.isUnilateral,
                instructions: exercise.instructions,
                notes: exercise.notes,
              }}
            />
            <RemoveExerciseButton
              id={exercise.id}
              name={capitalize(exercise.name)}
              archived={Boolean(exercise.archivedAt)}
            />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BodyMap
          title="Muscles worked"
          description="Darkest is the primary mover; lighter shades assist."
          levels={levels}
          figure={settings.sex ?? "male"}
          highlight={primary ? [primary] : []}
          compact
        />
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">How to do it</CardTitle>
            </CardHeader>
            <CardContent>
              {exercise.instructions.length > 0 ? (
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  {exercise.instructions.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No instructions{exercise.isCustom ? " — edit the exercise to add steps." : "."}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">My notes</CardTitle>
            </CardHeader>
            <CardContent>
              <NotesForm id={exercise.id} notes={exercise.notes} />
            </CardContent>
          </Card>
        </div>
      </div>

      <section aria-labelledby="records-heading" className="grid gap-3">
        <h2 id="records-heading" className="text-lg font-semibold">
          Personal records
        </h2>
        {records.length > 0 ? (
          <RecordsCards records={records} weightUnit={settings.weightUnit} />
        ) : (
          <EmptyState
            className="py-10"
            title="No records yet"
            description="Finish a workout with this exercise and your bests show up here."
          />
        )}
      </section>

      <section aria-labelledby="strength-heading" className="grid gap-4">
        <h2 id="strength-heading" className="text-lg font-semibold">
          Strength
        </h2>
        <E1rmChart
          points={e1rmSeries}
          formulaLabel={formulaLabel}
          weightUnit={settings.weightUnit}
        />
        {trainingMax && (
          <p className="text-sm">
            Training max:{" "}
            <strong className="tabular-nums">
              {formatWeight(trainingMax.trainingMaxKg, settings.weightUnit)}
            </strong>{" "}
            <span className="text-muted-foreground">
              since <time dateTime={trainingMax.effectiveFrom}>{trainingMax.effectiveFrom}</time>{" "}
              ·{" "}
            </span>
            <Link
              href="/health/gym/programs"
              className="text-primary underline-offset-4 hover:underline"
            >
              Programs
            </Link>
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Rep maxes</CardTitle>
              <p className="text-muted-foreground text-sm">
                {repMaxes.length > 0
                  ? `From your recent best e1RM of ${formatWeight(overview.bestRecentE1rm!.e1rmKg, settings.weightUnit)} (${formulaLabel}).`
                  : "Appears once you have a weight × reps set."}
              </p>
            </CardHeader>
            {repMaxes.length > 0 && (
              <CardContent>
                <RepMaxTable
                  rows={repMaxes}
                  caption={`Rep maxes, ${formulaLabel} formula`}
                  weightUnit={settings.weightUnit}
                />
              </CardContent>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">1RM calculator</CardTitle>
            </CardHeader>
            <CardContent>
              <OneRmCalculator formula={overview.formula} weightUnit={settings.weightUnit} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="history-heading" className="grid gap-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          History
        </h2>
        {history.rows.length > 0 ? (
          <>
            <HistoryTable
              rows={history.rows}
              isBodyweight={exercise.isBodyweight}
              weightUnit={settings.weightUnit}
            />
            <Pager
              label="History pages"
              from={from}
              to={to}
              total={history.total}
              prevHref={page > 1 ? historyHref(Math.min(page - 1, pages)) : null}
              nextHref={page < pages ? historyHref(page + 1) : null}
            />
          </>
        ) : (
          <EmptyState
            className="py-10"
            title="Not logged yet"
            description="Sessions that include this exercise will be listed here."
          />
        )}
      </section>
    </div>
  );
}
