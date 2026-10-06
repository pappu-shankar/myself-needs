import { DomainError } from "@/modules/core/errors";
import { nowLocalDateTime } from "@/lib/dates";
import { muscleOf } from "../../engine/muscles";
import {
  BODY_PARTS,
  EXERCISE_MODES,
  type BodyPart,
  type ExerciseMode,
  type Muscle,
} from "../../gym-types";
import {
  countExerciseRows,
  deleteExerciseRow,
  findActiveExerciseByName,
  getExerciseRow,
  insertExercise,
  isExerciseReferenced,
  listBodyPartCounts,
  listDistinctTargets,
  listEquipmentCounts,
  listExerciseRows,
  listExerciseRowsByIds,
  updateExerciseRow,
  type ExerciseRowFilter,
  type GymExerciseRow,
} from "../../db/queries/gym/exercises";
import { ensureExerciseCatalog } from "./catalog";
import { getGymSettings } from "./settings";

export type Exercise = GymExerciseRow;

/** Equipment that never needs owning — always allowed by the "equipment I have" filter. */
export const BODY_WEIGHT_EQUIPMENT = "body weight";

const MAX_PAGE_SIZE = 200;

export interface ExerciseListOptions {
  /** Every word must appear somewhere in the name, case-insensitive ("bench dumbbell" finds "Dumbbell Bench Press"). */
  query?: string;
  bodyPart?: string;
  equipment?: string;
  /** Body-map muscle the exercise primarily targets. */
  muscle?: Muscle;
  favoritesOnly?: boolean;
  /** Only equipment listed in gym settings (plus body weight); no-op when that list is empty. */
  ownedEquipmentOnly?: boolean;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ExercisePage {
  rows: Exercise[];
  total: number;
}

function exists(id: number): Exercise {
  ensureExerciseCatalog();
  const row = getExerciseRow(id);
  if (!row) throw new DomainError("That exercise doesn't exist anymore.");
  return row;
}

/** Library search: favorites first, then by name; filtered and paginated in SQL. */
export function listExercises(options: ExerciseListOptions = {}): ExercisePage {
  ensureExerciseCatalog();
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));

  const filter: ExerciseRowFilter = {
    words: (options.query ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8),
    bodyPart: options.bodyPart?.trim().toLowerCase() || undefined,
    equipment: options.equipment?.trim().toLowerCase() || undefined,
    favoritesOnly: options.favoritesOnly,
    includeArchived: options.includeArchived,
  };

  if (options.muscle) {
    // The dataset's target vocabulary is small; map each term onto the body
    // map and keep the ones that land on the requested muscle.
    const targets = listDistinctTargets().filter((term) => muscleOf(term) === options.muscle);
    if (targets.length === 0) return { rows: [], total: 0 };
    filter.targets = targets;
  }

  if (options.ownedEquipmentOnly) {
    const owned = getGymSettings().ownedEquipment;
    if (owned.length > 0) filter.equipmentIn = [...new Set([...owned, BODY_WEIGHT_EQUIPMENT])];
  }

  return { rows: listExerciseRows(filter, limit, offset), total: countExerciseRows(filter) };
}

export function getExercise(id: number): Exercise {
  return exists(id);
}

/** Exercises in the order of `ids`; unknown ids are skipped. */
export function getExercisesByIds(ids: readonly number[]): Exercise[] {
  ensureExerciseCatalog();
  const byId = new Map(listExerciseRowsByIds([...new Set(ids)]).map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/** Equipment in use, most common first — the library's filter options. */
export function listEquipmentOptions(
  options: { bodyPart?: string } = {},
): Array<{ equipment: string; count: number }> {
  ensureExerciseCatalog();
  return listEquipmentCounts(options.bodyPart?.trim().toLowerCase() || undefined);
}

/** Body parts in use, in the canonical BODY_PARTS order (anything else after, alphabetically). */
export function listBodyParts(): Array<{ bodyPart: string; count: number }> {
  ensureExerciseCatalog();
  const rank = (part: string) => {
    const index = BODY_PARTS.indexOf(part as BodyPart);
    return index < 0 ? BODY_PARTS.length : index;
  };
  return listBodyPartCounts().sort(
    (a, b) => rank(a.bodyPart) - rank(b.bodyPart) || a.bodyPart.localeCompare(b.bodyPart),
  );
}

/**
 * Primary target for a custom exercise that didn't name one, in the dataset's
 * vocabulary. Body parts that don't have one obvious mover ("upper arms",
 * "upper legs") keep the body part itself, which engine/muscles.ts doesn't
 * recognize as a muscle — so it falls back to its even split across the part.
 */
const DEFAULT_TARGET: Record<BodyPart, string> = {
  chest: "pectorals",
  back: "upper back",
  shoulders: "delts",
  "upper arms": "upper arms",
  "lower arms": "forearms",
  waist: "abs",
  "upper legs": "upper legs",
  "lower legs": "calves",
  neck: "traps",
  cardio: "cardiovascular system",
};

export interface CustomExerciseInput {
  name: string;
  bodyPart: string;
  /** Defaults to "body weight" for bodyweight moves, "other" otherwise. */
  equipment?: string | null;
  target?: string | null;
  secondaryMuscles?: readonly string[];
  /** Defaults to cardio for the cardio body part, reps otherwise. */
  defaultMode?: ExerciseMode;
  isBodyweight?: boolean;
  isUnilateral?: boolean;
  instructions?: readonly string[];
  notes?: string | null;
}

function cleanName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) throw new DomainError("Exercise name is required.");
  if (cleaned.length > 100) throw new DomainError("Exercise name must be at most 100 characters.");
  return cleaned;
}

function cleanNotes(notes: string | null | undefined, max = 2000): string | null {
  const cleaned = notes?.trim() ?? "";
  if (cleaned.length > max) throw new DomainError(`Notes must be at most ${max} characters.`);
  return cleaned || null;
}

function cleanTerms(values: readonly string[] | undefined, label: string): string[] {
  const list = [...new Set((values ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean))];
  if (list.length > 12 || list.some((v) => v.length > 60)) {
    throw new DomainError(`Too many or too long ${label}.`);
  }
  return list;
}

function toRowValues(input: CustomExerciseInput, exceptId?: number) {
  const name = cleanName(input.name);
  const bodyPart = input.bodyPart.trim().toLowerCase();
  if (!BODY_PARTS.includes(bodyPart as BodyPart)) throw new DomainError("Pick a body part.");
  const duplicate = findActiveExerciseByName(name, exceptId);
  if (duplicate) {
    throw new DomainError(
      duplicate.isCustom
        ? `You already have an exercise called "${duplicate.name}".`
        : `"${duplicate.name}" is already in the exercise library.`,
    );
  }
  const defaultMode = input.defaultMode ?? (bodyPart === "cardio" ? "cardio" : "reps");
  if (!EXERCISE_MODES.includes(defaultMode))
    throw new DomainError("Pick how the exercise is logged.");
  const isBodyweight = input.isBodyweight ?? false;
  const equipment =
    input.equipment?.trim().toLowerCase() || (isBodyweight ? BODY_WEIGHT_EQUIPMENT : "other");
  if (equipment.length > 60) throw new DomainError("Equipment must be at most 60 characters.");
  const target = input.target?.trim().toLowerCase() || DEFAULT_TARGET[bodyPart as BodyPart];
  if (target.length > 60) throw new DomainError("Target muscle must be at most 60 characters.");
  const instructions = (input.instructions ?? []).map((step) => step.trim()).filter(Boolean);
  if (instructions.length > 30 || instructions.some((step) => step.length > 500)) {
    throw new DomainError("Keep instructions to at most 30 steps of 500 characters.");
  }
  return {
    name,
    bodyPart,
    equipment,
    target,
    secondaryMuscles: cleanTerms(input.secondaryMuscles, "secondary muscles").filter(
      (muscle) => muscle !== target,
    ),
    instructions,
    defaultMode,
    isBodyweight,
    isUnilateral: input.isUnilateral ?? false,
    notes: cleanNotes(input.notes),
  };
}

/** A user-defined exercise. Name + body part is enough; everything else has a sensible default. */
export function createCustomExercise(input: CustomExerciseInput): Exercise {
  ensureExerciseCatalog();
  return insertExercise({ ...toRowValues(input), isCustom: true });
}

/** Replaces a custom exercise's definition. Built-in exercises only take notes and favorites. */
export function updateCustomExercise(id: number, input: CustomExerciseInput): Exercise {
  const current = exists(id);
  if (!current.isCustom) {
    throw new DomainError("Built-in exercises can't be edited — add your own notes instead.");
  }
  return updateExerciseRow(id, toRowValues(input, id))!;
}

export function updateExerciseNotes(id: number, notes: string | null): Exercise {
  exists(id);
  return updateExerciseRow(id, { notes: cleanNotes(notes) })!;
}

export function setExerciseFavorite(id: number, favorite: boolean): Exercise {
  exists(id);
  return updateExerciseRow(id, { isFavorite: favorite })!;
}

export type RemoveExerciseOutcome = "archived" | "deleted";

/**
 * Deletes a custom exercise, or archives it when a routine or a logged
 * workout still points at it — history must keep resolving its name.
 */
export function removeCustomExercise(id: number): { outcome: RemoveExerciseOutcome } {
  const current = exists(id);
  if (!current.isCustom) throw new DomainError("Built-in exercises can't be removed.");
  if (isExerciseReferenced(id)) {
    if (!current.archivedAt) updateExerciseRow(id, { archivedAt: nowLocalDateTime() });
    return { outcome: "archived" };
  }
  deleteExerciseRow(id);
  return { outcome: "deleted" };
}

/** Brings an archived custom exercise back into the library. */
export function restoreCustomExercise(id: number): Exercise {
  const current = exists(id);
  if (!current.archivedAt) return current;
  const duplicate = findActiveExerciseByName(current.name, id);
  if (duplicate) {
    throw new DomainError(
      `Another exercise is already called "${duplicate.name}" — rename one first.`,
    );
  }
  return updateExerciseRow(id, { archivedAt: null })!;
}
