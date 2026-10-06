import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/modules/core/session/guard";
import { listBodyParts, listEquipmentOptions, listExercises } from "@/modules/health";
import { primaryMuscleOf } from "@/modules/health/engine/muscles";
import { MUSCLES, MUSCLE_LABELS } from "@/modules/health/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ExerciseFormDialog } from "./exercise-form-dialog";
import { FavoriteButton } from "./favorite-button";
import {
  LIBRARY_PAGE_SIZE,
  capitalize,
  libraryHref,
  pageRange,
  parseLibraryParams,
} from "./library-params";
import { Pager } from "./pager";

export const metadata: Metadata = { title: "Exercise library — Gym — Personal Life OS" };

const selectClass = "border-input bg-background h-8 w-full rounded-md border px-3 text-sm";

export default async function ExerciseLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const filters = parseLibraryParams(await searchParams);

  const { rows, total } = listExercises({
    query: filters.q,
    bodyPart: filters.bodyPart || undefined,
    equipment: filters.equipment || undefined,
    muscle: filters.muscle ?? undefined,
    favoritesOnly: filters.favorites,
    ownedEquipmentOnly: filters.owned,
    includeArchived: filters.archived,
    limit: LIBRARY_PAGE_SIZE,
    offset: (filters.page - 1) * LIBRARY_PAGE_SIZE,
  });
  const bodyParts = listBodyParts();
  const allEquipment = listEquipmentOptions();
  const equipmentOptions = filters.bodyPart
    ? listEquipmentOptions({ bodyPart: filters.bodyPart })
    : allEquipment;
  if (filters.equipment && !equipmentOptions.some((o) => o.equipment === filters.equipment)) {
    equipmentOptions.push({ equipment: filters.equipment, count: 0 });
  }

  const { from, to, pages } = pageRange(filters.page, LIBRARY_PAGE_SIZE, total);
  const filtered = Boolean(
    filters.q ||
    filters.bodyPart ||
    filters.equipment ||
    filters.muscle ||
    filters.favorites ||
    filters.owned ||
    filters.archived,
  );

  return (
    <div>
      <PageHeader
        title="Exercise library"
        description="Search the built-in exercises, or add your own."
        actions={<ExerciseFormDialog equipmentOptions={allEquipment.map((o) => o.equipment)} />}
      />

      <form
        method="get"
        action="/health/gym/library"
        role="search"
        aria-label="Filter exercises"
        className="mb-6 grid gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Search" htmlFor="lib-q" className="sm:col-span-2 lg:col-span-1">
            <Input
              type="search"
              name="q"
              defaultValue={filters.q}
              maxLength={100}
              placeholder="e.g. dumbbell bench"
            />
          </FormField>
          <FormField label="Body part" htmlFor="lib-bodyPart">
            <select name="bodyPart" defaultValue={filters.bodyPart} className={selectClass}>
              <option value="">All body parts</option>
              {bodyParts.map((b) => (
                <option key={b.bodyPart} value={b.bodyPart}>
                  {capitalize(b.bodyPart)} ({b.count})
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Equipment"
            htmlFor="lib-equipment"
            hint={filters.bodyPart ? "Narrowed to the chosen body part" : undefined}
          >
            <select name="equipment" defaultValue={filters.equipment} className={selectClass}>
              <option value="">Any equipment</option>
              {equipmentOptions.map((o) => (
                <option key={o.equipment} value={o.equipment}>
                  {capitalize(o.equipment)}
                  {o.count > 0 ? ` (${o.count})` : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Primary muscle" htmlFor="lib-muscle">
            <select name="muscle" defaultValue={filters.muscle ?? ""} className={selectClass}>
              <option value="">Any muscle</option>
              {MUSCLES.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABELS[m]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <legend className="sr-only">Show only</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="favorites"
              value="1"
              defaultChecked={filters.favorites}
              className="size-4"
            />
            Favorites only
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="owned"
              value="1"
              defaultChecked={filters.owned}
              className="size-4"
            />
            Equipment I own
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="archived"
              value="1"
              defaultChecked={filters.archived}
              className="size-4"
            />
            Show archived custom exercises
          </label>
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit">
            <Search aria-hidden="true" />
            Apply filters
          </Button>
          {filtered && (
            <Link href="/health/gym/library" className={buttonVariants({ variant: "ghost" })}>
              Clear
            </Link>
          )}
        </div>
      </form>

      <p role="status" className="text-muted-foreground mb-3 text-sm tabular-nums">
        {total} {total === 1 ? "exercise" : "exercises"}
        {filtered ? " match" : ""}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="No exercises found"
          description="Try fewer filters or a different search, or add your own exercise."
        />
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {rows.map((exercise) => {
            const muscle = primaryMuscleOf(exercise);
            const primary = muscle ? MUSCLE_LABELS[muscle] : capitalize(exercise.target);
            return (
              <li key={exercise.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/health/gym/library/${exercise.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {capitalize(exercise.name)}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {capitalize(exercise.bodyPart)} · {capitalize(exercise.equipment)} · {primary}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
                    {exercise.isCustom && <Badge variant="secondary">Custom</Badge>}
                    {exercise.isBodyweight && <Badge variant="outline">Bodyweight</Badge>}
                    {exercise.defaultMode === "time" && <Badge variant="outline">Timed</Badge>}
                    {exercise.defaultMode === "cardio" && <Badge variant="outline">Cardio</Badge>}
                    {exercise.archivedAt && <Badge variant="destructive">Archived</Badge>}
                  </div>
                </div>
                <FavoriteButton
                  id={exercise.id}
                  name={exercise.name}
                  favorite={exercise.isFavorite}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4">
        <Pager
          label="Exercise pages"
          from={from}
          to={to}
          total={total}
          prevHref={
            filters.page > 1
              ? libraryHref(filters, { page: Math.min(filters.page - 1, pages) })
              : null
          }
          nextHref={filters.page < pages ? libraryHref(filters, { page: filters.page + 1 }) : null}
        />
      </div>
    </div>
  );
}
