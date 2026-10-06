import { DomainError } from "@/modules/core/errors";
import { nowLocalDateTime } from "@/lib/dates";
import {
  EXERCISE_MODES,
  LOADING_SCHEMES,
  POLICIES_FOR_MODE,
  PROGRESSION_POLICIES,
  type ExerciseMode,
  type LoadingScheme,
  type ProgressionPolicy,
} from "../../gym-types";
import {
  deleteRoutineEntryRow,
  deleteRoutineRow,
  getRoutineEntryRow,
  getRoutineRow,
  inTransaction,
  insertRoutine,
  insertRoutineEntries,
  insertRoutineEntry,
  listEntryNamesForRoutines,
  listRawRoutineEntries,
  listRoutineEntryOrder,
  listRoutineEntryRows,
  listRoutineNames,
  listRoutineRows,
  nextEntryPosition,
  nextRoutinePosition,
  setEntryLayout,
  updateRoutineEntryRow,
  updateRoutineRow,
  type GymRoutineEntryRow,
  type GymRoutinePatch,
  type GymRoutineRow,
} from "../../db/queries/gym/routines";
import { getExerciseRow } from "../../db/queries/gym/exercises";
import { ensureExerciseCatalog } from "./catalog";

export type Routine = GymRoutineRow;
export type RoutineEntryRow = GymRoutineEntryRow;

export interface RoutineSummary extends Routine {
  entryCount: number;
  /** The first few exercise names, in order — a list preview. */
  exerciseNames: string[];
}

/** The exercise facts a routine editor and the prescription engine need. */
export interface RoutineEntryExercise {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  isBodyweight: boolean;
  isUnilateral: boolean;
  defaultMode: ExerciseMode;
  isCustom: boolean;
  archivedAt: string | null;
}

export interface RoutineEntry extends RoutineEntryRow {
  /** The entry's override, else the routine's policy if the mode allows it. */
  effectivePolicy: ProgressionPolicy;
  exercise: RoutineEntryExercise;
}

export interface RoutineDetail extends Routine {
  entries: RoutineEntry[];
}

const PREVIEW_NAMES = 5;

function routineOrThrow(id: number): Routine {
  const routine = getRoutineRow(id);
  if (!routine) throw new DomainError("That routine doesn't exist anymore.");
  return routine;
}

function entryOrThrow(id: number): RoutineEntryRow {
  const entry = getRoutineEntryRow(id);
  if (!entry) throw new DomainError("That exercise isn't in the routine anymore.");
  return entry;
}

/**
 * Which progression rule an entry actually runs: its own override, else the
 * routine's default when that rule makes sense for the entry's mode. A timed
 * hold under a progressing routine adds time; anything else falls back to off.
 */
export function effectivePolicy(
  entryPolicy: ProgressionPolicy | null,
  routinePolicy: ProgressionPolicy,
  mode: ExerciseMode,
): ProgressionPolicy {
  if (entryPolicy) return entryPolicy;
  if (POLICIES_FOR_MODE[mode].includes(routinePolicy)) return routinePolicy;
  if (mode === "time" && routinePolicy !== "off") return "time";
  return "off";
}

export function listRoutines(
  options: { includeArchived?: boolean; limit?: number; offset?: number } = {},
): RoutineSummary[] {
  const limit = Math.min(200, Math.max(1, Math.trunc(options.limit ?? 100)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const routines = listRoutineRows(options.includeArchived ?? false, limit, offset);
  const names = new Map<number, string[]>();
  for (const row of listEntryNamesForRoutines(routines.map((r) => r.id))) {
    const list = names.get(row.routineId) ?? [];
    if (list.length < PREVIEW_NAMES) list.push(row.name);
    names.set(row.routineId, list);
  }
  return routines.map((routine) => ({ ...routine, exerciseNames: names.get(routine.id) ?? [] }));
}

export function getRoutine(id: number): RoutineDetail {
  const routine = routineOrThrow(id);
  const entries = listRoutineEntryRows(id).map(({ entry, exercise }) => ({
    ...entry,
    effectivePolicy: effectivePolicy(
      entry.progressionPolicy,
      routine.progressionPolicy,
      entry.mode,
    ),
    exercise,
  }));
  return { ...routine, entries };
}

export interface RoutineInput {
  name: string;
  notes?: string | null;
  progressionPolicy?: ProgressionPolicy;
}

function cleanRoutineName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) throw new DomainError("Routine name is required.");
  if (cleaned.length > 100) throw new DomainError("Routine name must be at most 100 characters.");
  return cleaned;
}

function cleanNotes(notes: string | null | undefined, max: number): string | null {
  const cleaned = notes?.trim() ?? "";
  if (cleaned.length > max) throw new DomainError(`Notes must be at most ${max} characters.`);
  return cleaned || null;
}

function assertPolicy(policy: ProgressionPolicy): void {
  if (!PROGRESSION_POLICIES.includes(policy))
    throw new DomainError("Pick a valid progression rule.");
}

/** `base`, or `base (2)`, `base (3)` … — whichever no routine uses yet. */
export function uniqueRoutineName(base: string): string {
  const taken = new Set(listRoutineNames().map((name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function createRoutine(input: RoutineInput): Routine {
  const progressionPolicy = input.progressionPolicy ?? "linear";
  assertPolicy(progressionPolicy);
  return insertRoutine({
    name: cleanRoutineName(input.name),
    notes: cleanNotes(input.notes, 1000),
    progressionPolicy,
    position: nextRoutinePosition(),
  });
}

export function updateRoutine(id: number, patch: Partial<RoutineInput>): Routine {
  routineOrThrow(id);
  const values: GymRoutinePatch = {};
  if (patch.name !== undefined) values.name = cleanRoutineName(patch.name);
  if (patch.notes !== undefined) values.notes = cleanNotes(patch.notes, 1000);
  if (patch.progressionPolicy !== undefined) {
    assertPolicy(patch.progressionPolicy);
    values.progressionPolicy = patch.progressionPolicy;
  }
  return Object.keys(values).length ? updateRoutineRow(id, values)! : routineOrThrow(id);
}

/** A copy of the routine and all its entries, named "<name> (copy)". */
export function duplicateRoutine(id: number): Routine {
  const source = routineOrThrow(id);
  return inTransaction(() => {
    const copy = insertRoutine({
      name: uniqueRoutineName(`${source.name} (copy)`.slice(0, 100)),
      notes: source.notes,
      progressionPolicy: source.progressionPolicy,
      position: nextRoutinePosition(),
    });
    const entries = listRawRoutineEntries(id);
    const groups = normalizeSupersetGroups(entries.map((e) => e.supersetGroup));
    insertRoutineEntries(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      entries.map(({ id: _id, routineId: _routine, ...entry }, index) => ({
        ...entry,
        routineId: copy.id,
        position: index,
        supersetGroup: groups[index],
      })),
    );
    return copy;
  });
}

/** Hidden from lists and from the plan; history and the routine itself stay intact. */
export function archiveRoutine(id: number): Routine {
  const routine = routineOrThrow(id);
  return routine.archivedAt ? routine : updateRoutineRow(id, { archivedAt: nowLocalDateTime() })!;
}

export function restoreRoutine(id: number): Routine {
  const routine = routineOrThrow(id);
  return routine.archivedAt ? updateRoutineRow(id, { archivedAt: null })! : routine;
}

/** Hard delete. Logged workouts keep their snapshot name (their routine link becomes null). */
export function deleteRoutine(id: number): void {
  routineOrThrow(id);
  deleteRoutineRow(id);
}

// ---------------------------------------------------------------------------
// Entries

/** Editable prescription fields of one entry. `null` clears a field. */
export interface RoutineEntryPatch {
  mode?: ExerciseMode;
  sets?: number;
  reps?: number | null;
  repsMin?: number | null;
  weightKg?: number | null;
  durationSec?: number | null;
  distanceKm?: number | null;
  restSec?: number | null;
  perSide?: boolean;
  isBodyweight?: boolean;
  /** Null = inherit the routine's policy. */
  progressionPolicy?: ProgressionPolicy | null;
  incrementKg?: number | null;
  targetRpe?: number | null;
  scheme?: LoadingScheme;
  notes?: string | null;
}

type EntryValues = Required<RoutineEntryPatch>;

const ENTRY_KEYS = [
  "mode",
  "sets",
  "reps",
  "repsMin",
  "weightKg",
  "durationSec",
  "distanceKm",
  "restSec",
  "perSide",
  "isBodyweight",
  "progressionPolicy",
  "incrementKg",
  "targetRpe",
  "scheme",
  "notes",
] as const satisfies ReadonlyArray<keyof RoutineEntryPatch>;

function pickEntryValues(row: RoutineEntryRow): EntryValues {
  const values = {} as Record<keyof EntryValues, unknown>;
  for (const key of ENTRY_KEYS) values[key] = row[key];
  return values as EntryValues;
}

/** A new entry's starting prescription for a mode. Cardio is one 20-minute bout, not three. */
function modeDefaults(
  mode: ExerciseMode,
): Pick<EntryValues, "sets" | "reps" | "durationSec" | "distanceKm"> {
  switch (mode) {
    case "reps":
      return { sets: 3, reps: 10, durationSec: null, distanceKm: null };
    case "time":
      return { sets: 3, reps: null, durationSec: 45, distanceKm: null };
    case "cardio":
      return { sets: 1, reps: null, durationSec: 1200, distanceKm: null };
  }
}

/**
 * Applies a patch. On a mode change, carried-over values the new mode can't
 * use (a policy it doesn't allow, a 5/3/1 scheme outside reps mode) are reset
 * and the mode's main target is filled in — only values the patch itself
 * sets are held to the rules strictly.
 */
function applyPatch(current: EntryValues, patch: RoutineEntryPatch): EntryValues {
  const next = { ...current };
  for (const key of ENTRY_KEYS) {
    if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key];
  }
  if (next.mode !== current.mode) {
    if (
      patch.progressionPolicy === undefined &&
      next.progressionPolicy &&
      !POLICIES_FOR_MODE[next.mode].includes(next.progressionPolicy)
    ) {
      next.progressionPolicy = null;
    }
    if (patch.scheme === undefined && next.mode !== "reps") next.scheme = "standard";
    const defaults = modeDefaults(next.mode);
    if (next.mode === "reps" && patch.reps === undefined) next.reps ??= defaults.reps;
    if (next.mode !== "reps" && patch.durationSec === undefined) {
      next.durationSec ??= defaults.durationSec;
    }
  }
  return next;
}

function checkInt(value: number | null, min: number, max: number, message: string): void {
  if (value === null) return;
  if (!Number.isInteger(value) || value < min || value > max) throw new DomainError(message);
}

function checkNumber(value: number | null, min: number, max: number, message: string): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < min || value > max) throw new DomainError(message);
}

/** Every rule an entry must satisfy, whichever way it was edited. */
function assertEntry(values: EntryValues): void {
  if (!EXERCISE_MODES.includes(values.mode))
    throw new DomainError("Pick how the exercise is logged.");
  checkInt(values.sets, 1, 20, "Sets must be a whole number from 1 to 20.");
  checkInt(values.reps, 1, 100, "Reps must be a whole number from 1 to 100.");
  checkInt(
    values.repsMin,
    1,
    100,
    "The bottom of the rep range must be a whole number from 1 to 100.",
  );
  if (values.repsMin !== null) {
    if (values.reps === null) throw new DomainError("Set the top of the rep range too.");
    if (values.repsMin > values.reps) {
      throw new DomainError("The bottom of the rep range can't be above the top.");
    }
  }
  if (values.mode === "reps" && values.reps === null) throw new DomainError("Set a rep target.");
  checkNumber(values.weightKg, 0, 1000, "Weight can't be negative (or above 1000 kg).");
  checkNumber(values.incrementKg, 0, 50, "The weight step must be between 0 and 50 kg.");
  checkInt(
    values.durationSec,
    1,
    86_400,
    "Duration must be a whole number of seconds, up to 24 hours.",
  );
  if (values.mode === "time" && values.durationSec === null) {
    throw new DomainError("Set how long to hold it.");
  }
  checkNumber(values.distanceKm, 0, 1000, "Distance must be between 0 and 1000 km.");
  if (values.mode === "cardio" && values.durationSec === null && values.distanceKm === null) {
    throw new DomainError("Set a duration or a distance.");
  }
  checkInt(values.restSec, 0, 900, "Rest must be a whole number of seconds from 0 to 900.");
  checkNumber(values.targetRpe, 5, 10, "Target RPE must be between 5 and 10.");
  if (values.progressionPolicy !== null) {
    if (!POLICIES_FOR_MODE[values.mode].includes(values.progressionPolicy)) {
      throw new DomainError("That progression rule doesn't apply to this kind of exercise.");
    }
  }
  if (!LOADING_SCHEMES.includes(values.scheme))
    throw new DomainError("Pick a valid loading scheme.");
  if (values.scheme !== "standard" && values.mode !== "reps") {
    throw new DomainError("5/3/1 loading only works for weight × reps exercises.");
  }
  if (values.notes !== null && values.notes.length > 500) {
    throw new DomainError("Notes must be at most 500 characters.");
  }
}

function cleanPatchNotes(patch: RoutineEntryPatch): RoutineEntryPatch {
  return patch.notes === undefined ? patch : { ...patch, notes: patch.notes?.trim() || null };
}

/**
 * Appends an exercise to a routine. The starting prescription comes from the
 * exercise (mode, bodyweight, per side) and the mode's defaults; `overrides`
 * replace any of it and are validated like an edit.
 */
export function addRoutineEntry(
  routineId: number,
  exerciseId: number,
  overrides: RoutineEntryPatch = {},
): RoutineEntryRow {
  routineOrThrow(routineId);
  ensureExerciseCatalog();
  const exercise = getExerciseRow(exerciseId);
  if (!exercise) throw new DomainError("That exercise doesn't exist anymore.");
  if (exercise.archivedAt) throw new DomainError("That exercise is archived — restore it first.");

  const mode = overrides.mode ?? exercise.defaultMode;
  const base: EntryValues = {
    mode,
    ...modeDefaults(mode),
    repsMin: null,
    weightKg: null,
    restSec: null,
    perSide: exercise.isUnilateral,
    isBodyweight: exercise.isBodyweight,
    progressionPolicy: null,
    incrementKg: null,
    targetRpe: null,
    scheme: "standard",
    notes: null,
  };
  const values = applyPatch(base, cleanPatchNotes({ ...overrides, mode: undefined }));
  assertEntry(values);
  return insertRoutineEntry({
    ...values,
    routineId,
    exerciseId,
    position: nextEntryPosition(routineId),
  });
}

export function updateRoutineEntry(entryId: number, patch: RoutineEntryPatch): RoutineEntryRow {
  const entry = entryOrThrow(entryId);
  const values = applyPatch(pickEntryValues(entry), cleanPatchNotes(patch));
  assertEntry(values);
  return updateRoutineEntryRow(entryId, values)!;
}

// ---------------------------------------------------------------------------
// Order and supersets

/**
 * Superset groups only mean something as runs of adjacent entries. Any run of
 * one is dropped (a superset of one exercise is just an exercise) and the
 * surviving runs are renumbered 1, 2, 3 … in order, so a number never names
 * two separate runs.
 */
export function normalizeSupersetGroups(
  groups: ReadonlyArray<number | null>,
): Array<number | null> {
  const out: Array<number | null> = groups.map(() => null);
  let next = 1;
  let i = 0;
  while (i < groups.length) {
    const group = groups[i];
    let end = i;
    if (group !== null) {
      while (end + 1 < groups.length && groups[end + 1] === group) end++;
      if (end > i) {
        for (let k = i; k <= end; k++) out[k] = next;
        next++;
      }
    }
    i = end + 1;
  }
  return out;
}

type OrderItem = { id: number; position: number; supersetGroup: number | null };

/** Writes positions 0…n−1 and cleaned-up superset groups for `ordered`, touching only changed rows. */
function writeLayout(
  routineId: number,
  ordered: readonly OrderItem[],
  groups: ReadonlyArray<number | null>,
) {
  const clean = normalizeSupersetGroups(groups);
  const changed = ordered
    .map((item, index) => ({
      id: item.id,
      position: index,
      supersetGroup: clean[index],
      before: item,
    }))
    .filter(
      (item) =>
        item.before.position !== item.position || item.before.supersetGroup !== item.supersetGroup,
    )
    .map(({ id, position, supersetGroup }) => ({ id, position, supersetGroup }));
  if (changed.length) setEntryLayout(routineId, changed);
}

export function removeRoutineEntry(entryId: number): void {
  const entry = entryOrThrow(entryId);
  inTransaction(() => {
    deleteRoutineEntryRow(entryId);
    const rest = listRoutineEntryOrder(entry.routineId);
    writeLayout(
      entry.routineId,
      rest,
      rest.map((item) => item.supersetGroup),
    );
  });
}

/**
 * Puts the routine's entries in the given order. `orderedEntryIds` must be
 * exactly the routine's entries — anything else means the editor is stale.
 */
export function reorderRoutineEntries(routineId: number, orderedEntryIds: readonly number[]): void {
  routineOrThrow(routineId);
  inTransaction(() => {
    const current = listRoutineEntryOrder(routineId);
    const byId = new Map(current.map((item) => [item.id, item]));
    const isPermutation =
      orderedEntryIds.length === current.length &&
      new Set(orderedEntryIds).size === orderedEntryIds.length &&
      orderedEntryIds.every((id) => byId.has(id));
    if (!isPermutation) {
      throw new DomainError("The routine changed while you were editing — reload and try again.");
    }
    const ordered = orderedEntryIds.map((id) => byId.get(id)!);
    writeLayout(
      routineId,
      ordered,
      ordered.map((item) => item.supersetGroup),
    );
  });
}

function locate(entryId: number) {
  const entry = entryOrThrow(entryId);
  const order = listRoutineEntryOrder(entry.routineId);
  const index = order.findIndex((item) => item.id === entryId);
  return {
    routineId: entry.routineId,
    order,
    index,
    groups: normalizeSupersetGroups(order.map((i) => i.supersetGroup)),
  };
}

/** Pairs an entry with the one after it; either side's existing superset grows to include the other. */
export function linkSuperset(entryId: number): void {
  inTransaction(() => {
    const { routineId, order, index, groups } = locate(entryId);
    if (index + 1 >= order.length) {
      throw new DomainError("This is the last exercise — there's nothing after it to pair with.");
    }
    const mine = groups[index];
    const theirs = groups[index + 1];
    if (mine !== null && mine === theirs) return;
    const group = mine ?? theirs ?? Math.max(0, ...groups.map((g) => g ?? 0)) + 1;
    groups[index] = group;
    groups[index + 1] = group;
    // Groups are normalized (one number per run), so this pulls the next
    // entry's whole superset along and the two merge into one.
    if (theirs !== null) {
      for (let k = index + 2; k < order.length && groups[k] === theirs; k++) groups[k] = group;
    }
    writeLayout(routineId, order, groups);
  });
}

/** Takes an entry out of its superset; a partner left on its own is ungrouped too. */
export function unlinkSuperset(entryId: number): void {
  inTransaction(() => {
    const { routineId, order, index, groups } = locate(entryId);
    if (groups[index] === null) return;
    groups[index] = null;
    writeLayout(routineId, order, groups);
  });
}
