/**
 * Helpers shared by the CSV parsers (Strong, Hevy, FitNotes): date/number/unit
 * reading, warning collection, and the generic "one row per set" table reader
 * that turns a column map into `ImportedWorkout`s. The column-map approach
 * follows openGym's importer (AGPL-3.0): every app exports the same thing in
 * a different dialect, so a new app is mostly a few header aliases.
 */
import { normalizeHeader, parseCsv } from "./csv";
import type { ImportedExercise, ImportedSet, ImportedWorkout, ParseResult } from "./types";
import type { ImportSource, SetKind } from "../gym-types";

export const LB_TO_KG = 0.45359237;

export type WeightUnit = "kg" | "lb";

export interface CsvParseOptions {
  /** Unit of a bare `Weight` column that carries no unit of its own (Strong). Default kg. */
  weightUnit?: WeightUnit;
}

const pad = (n: number | string) => String(n).padStart(2, "0");

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export interface When {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm:ss`, or null when the source had only a date. */
  time: string | null;
}

function clock(h?: string, m?: string, s?: string): string | null {
  if (h === undefined) return null;
  return `${pad(Number(h))}:${pad(Number(m ?? 0))}:${pad(Number(s ?? 0))}`;
}

function realDate(y: number, m: number, d: number): string | null {
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Reads the date formats the apps write — `2024-03-07`, `2020-12-30 18:51:52`,
 * `2024-03-07T18:51:00Z`, `22 Dec 2025, 08:00`, `Dec 22, 2025` and a bare
 * numeric `07/03/2024` (day-first when ambiguous: unambiguous exporters never
 * write that, so it came through a spreadsheet, usually European). The wall
 * clock is kept as written; timezone suffixes are ignored.
 */
export function parseWhen(input: string): When | null {
  const v = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (m) {
    const date = realDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? { date, time: clock(m[4], m[5], m[6]) } : null;
  }
  m =
    /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(
      v,
    );
  if (m && MONTHS[m[2].toLowerCase()]) {
    const date = realDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
    return date ? { date, time: clock(m[4], m[5], m[6]) } : null;
  }
  m =
    /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(
      v,
    );
  if (m && MONTHS[m[1].toLowerCase()]) {
    const date = realDate(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
    return date ? { date, time: clock(m[4], m[5], m[6]) } : null;
  }
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[, ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const date = realDate(Number(m[3]), month, day);
    return date ? { date, time: clock(m[4], m[5], m[6]) } : null;
  }
  return null;
}

/** Local `YYYY-MM-DDTHH:mm:ss` plus a number of seconds. Pure string/Date arithmetic. */
export function addSecondsLocal(dateTime: string, seconds: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(dateTime);
  if (!m) return dateTime;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6] + Math.round(seconds));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Seconds from `a` to `b` (both local date-times). */
export function secondsBetweenLocal(a: string, b: string): number {
  const toMs = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(s);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
  };
  return (toMs(b) - toMs(a)) / 1000;
}

/** A decimal that may use a comma ("60,5" from a semicolon CSV). Null when blank/unreadable. */
export function parseNumber(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export const lbToKg = (lb: number): number => round(lb * LB_TO_KG, 2);

/**
 * `HH:MM:SS`, `MM:SS`, `90` (seconds) or Strong's `1h 5m` / `45m` / `30s` → seconds.
 * Null when blank or unreadable.
 */
export function parseDurationSeconds(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => Number(p));
    if (parts.some((p) => !Number.isFinite(p))) return null;
    return parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + (parts[1] ?? 0);
  }
  const h = /(\d+(?:\.\d+)?)\s*h/i.exec(s);
  const mi = /(\d+(?:\.\d+)?)\s*m(?!s)/i.exec(s);
  const se = /(\d+(?:\.\d+)?)\s*s/i.exec(s);
  if (h || mi || se) {
    return Math.round((h ? +h[1] * 3600 : 0) + (mi ? +mi[1] * 60 : 0) + (se ? +se[1] : 0));
  }
  const n = parseNumber(s);
  return n === null ? null : Math.round(n);
}

const KM_PER_UNIT: Record<string, number> = {
  km: 1,
  m: 0.001,
  mi: 1.609344,
  mile: 1.609344,
  miles: 1.609344,
  ft: 0.0003048,
  yd: 0.0009144,
  cm: 0.00001,
};

export function distanceToKm(value: number, unit: string | undefined): number {
  const factor = KM_PER_UNIT[(unit ?? "km").toLowerCase().trim()] ?? 1;
  return round(value * factor, 4);
}

/** An RPE out of someone else's export: blank/0 = not rated, above 10 is capped. */
export function parseRpe(raw: string | undefined): number | null {
  const n = parseNumber(raw);
  if (n === null || n <= 0) return null;
  return Math.min(10, round(n, 2));
}

/** An RIR column (rare). 0 is a real rating — a set taken to failure. */
export function parseRir(raw: string | undefined): number | null {
  const n = parseNumber(raw);
  if (n === null || n < 0) return null;
  return Math.min(10, round(n, 2));
}

/** Collects human-readable warnings, capping the list so a bad file can't flood the UI. */
export class WarningCollector {
  readonly list: string[] = [];
  private extra = 0;
  constructor(private readonly cap = 25) {}
  add(message: string): void {
    if (this.list.length < this.cap) this.list.push(message);
    else this.extra++;
  }
  result(): string[] {
    return this.extra > 0 ? [...this.list, `…and ${this.extra} more warnings.`] : [...this.list];
  }
}

/* ------------------------------------------------------------ table reader */

type Field =
  | "exercise"
  | "date"
  | "startTime"
  | "endTime"
  | "workoutName"
  | "workoutNotes"
  | "exerciseNotes"
  | "note"
  | "weightKg"
  | "weightLb"
  | "weight"
  | "weightUnit"
  | "reps"
  | "rpe"
  | "rir"
  | "distanceKm"
  | "distance"
  | "distanceUnit"
  | "seconds"
  | "time"
  | "workoutDuration"
  | "setOrder"
  | "setType";

const COLUMNS: Array<[Field, string[]]> = [
  ["exercise", ["exercise", "exercise name", "exercise title"]],
  ["date", ["date", "workout date"]],
  ["startTime", ["start time"]],
  ["endTime", ["end time"]],
  ["workoutName", ["workout name", "title"]],
  ["workoutNotes", ["workout notes", "description"]],
  ["exerciseNotes", ["exercise notes"]],
  ["note", ["comment", "comments", "notes", "note"]],
  ["weightKg", ["weight kg"]],
  ["weightLb", ["weight lbs", "weight lb"]],
  ["weight", ["weight"]],
  ["weightUnit", ["weight unit", "unit"]],
  ["reps", ["reps", "repetitions"]],
  ["rpe", ["rpe", "rpe rating"]],
  ["rir", ["rir", "reps in reserve"]],
  ["distanceKm", ["distance km"]],
  ["distance", ["distance"]],
  ["distanceUnit", ["distance unit"]],
  ["seconds", ["seconds", "duration seconds"]],
  ["time", ["time"]],
  ["workoutDuration", ["duration"]],
  ["setOrder", ["set order", "set index", "set"]],
  ["setType", ["set type", "kind"]],
];

function mapHeader(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const n = normalizeHeader(h);
    for (const [field, names] of COLUMNS) {
      if (map[field] === undefined && names.includes(n)) {
        map[field] = i;
        return;
      }
    }
  });
  return map;
}

export interface RowView {
  /** Trimmed cell text for a field ("" when the column is absent). */
  (field: Field): string;
}

export interface SetTableOptions extends CsvParseOptions {
  source: Extract<ImportSource, "strong" | "hevy" | "fitnotes">;
  /** Time used when a file only carries dates (FitNotes). */
  defaultTime: string;
  /** The set kind for a row, or "skip" for rows that aren't sets (Strong rest timers). */
  kindOf: (cell: RowView) => SetKind | "skip";
  /** Whether the source has a per-set Time column (FitNotes). */
  perSetTime: boolean;
}

interface WorkoutDraft {
  startedAt: string;
  date: string;
  name: string;
  notes: string | null;
  finishedAt: string | null;
  durationSec: number | null;
  exercises: Map<string, ImportedExercise>;
  setCount: number;
}

/**
 * Reads an "one row per set" export into workouts. Rows that can't be used
 * become warnings (never thrown, never silently dropped) — a multi-year history
 * always has a few oddities and losing the file over one helps nobody.
 */
export function parseSetTable(text: string, opts: SetTableOptions): ParseResult {
  const warnings = new WarningCollector();
  const rows = parseCsv(text);
  const fail = (msg: string): ParseResult => ({
    source: opts.source,
    workouts: [],
    weighIns: [],
    warnings: [msg],
  });
  if (rows.length < 2) return fail("The file has no data rows.");
  const map = mapHeader(rows[0]);
  const dateField: Field | null =
    map.date !== undefined ? "date" : map.startTime !== undefined ? "startTime" : null;
  if (!dateField || map.exercise === undefined) {
    return fail("Couldn't find the date and exercise columns this format needs.");
  }

  const defaultWeightUnit = opts.weightUnit ?? "kg";
  const drafts = new Map<string, WorkoutDraft>();
  let restRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const cell: RowView = (field) => {
      const idx = map[field];
      return idx === undefined ? "" : (r[idx] ?? "").trim();
    };
    const rowLabel = `Row ${i + 1}`;
    const kind = opts.kindOf(cell);
    if (kind === "skip") {
      restRows++;
      continue;
    }
    const name = cell("exercise");
    const when = parseWhen(cell(dateField));
    if (!name) {
      warnings.add(`${rowLabel}: no exercise name, skipped.`);
      continue;
    }
    if (!when) {
      warnings.add(`${rowLabel} (${name}): couldn't read the date "${cell(dateField)}", skipped.`);
      continue;
    }

    // Explicit kg / lb columns beat a generic column plus a unit column.
    let weight: number | null = null;
    const kgCell = parseNumber(cell("weightKg"));
    const lbCell = parseNumber(cell("weightLb"));
    if (kgCell !== null && (kgCell !== 0 || lbCell === null)) weight = round(kgCell, 3);
    else if (lbCell !== null) weight = lbToKg(lbCell);
    else {
      const w = parseNumber(cell("weight"));
      if (w !== null) {
        const unit = cell("weightUnit").toLowerCase();
        const lb = unit.startsWith("lb") || (!unit && defaultWeightUnit === "lb");
        weight = lb ? lbToKg(w) : round(w, 3);
      }
    }
    if (weight !== null && weight <= 0) weight = null;

    const repsRaw = parseNumber(cell("reps"));
    const reps = repsRaw !== null && repsRaw > 0 ? Math.round(repsRaw) : null;
    let durationSec = parseDurationSeconds(cell("seconds"));
    if (!durationSec && opts.perSetTime) durationSec = parseDurationSeconds(cell("time"));
    if (!durationSec) durationSec = null;
    let distanceKm: number | null = parseNumber(cell("distanceKm"));
    if (distanceKm === null) {
      const d = parseNumber(cell("distance"));
      if (d !== null) distanceKm = distanceToKm(d, cell("distanceUnit") || undefined);
    }
    if (distanceKm !== null && distanceKm <= 0) distanceKm = null;

    if (weight === null && reps === null && durationSec === null && distanceKm === null) {
      warnings.add(`${rowLabel} (${name}): empty set, skipped.`);
      continue;
    }

    const rir = parseRir(cell("rir"));
    const set: ImportedSet = {
      kind,
      weightKg: weight,
      reps,
      durationSec,
      distanceKm,
      rpe: rir === null ? parseRpe(cell("rpe")) : null,
      rir,
    };

    const workoutName = cell("workoutName");
    const startedAt = `${when.date}T${when.time ?? opts.defaultTime}`;
    const key = `${startedAt}|${workoutName}`;
    let draft = drafts.get(key);
    if (!draft) {
      let finishedAt: string | null = null;
      const end = map.endTime !== undefined ? parseWhen(cell("endTime")) : null;
      if (end) {
        const endAt = `${end.date}T${end.time ?? opts.defaultTime}`;
        if (secondsBetweenLocal(startedAt, endAt) > 0) finishedAt = endAt;
      }
      draft = {
        startedAt,
        date: when.date,
        name: workoutName,
        notes: cell("workoutNotes") || null,
        finishedAt,
        durationSec: parseDurationSeconds(cell("workoutDuration")),
        exercises: new Map(),
        setCount: 0,
      };
      drafts.set(key, draft);
    }
    const exKey = name.toLowerCase();
    let exercise = draft.exercises.get(exKey);
    if (!exercise) {
      exercise = { name, notes: null, sets: [] };
      draft.exercises.set(exKey, exercise);
    }
    exercise.notes ??= cell("exerciseNotes") || cell("note") || null;
    exercise.sets.push(set);
    draft.setCount++;
  }

  if (restRows > 0) warnings.add(`Ignored ${restRows} rest-timer rows (not sets).`);

  const workouts: ImportedWorkout[] = [...drafts.values()]
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
    .map((d) => {
      const name = d.name || (opts.source === "fitnotes" ? "FitNotes workout" : "Imported workout");
      const finishedAt =
        d.finishedAt ?? (d.durationSec ? addSecondsLocal(d.startedAt, d.durationSec) : null);
      return {
        ref: `${opts.source}:${d.startedAt}:${name}`,
        date: d.date,
        startedAt: d.startedAt,
        finishedAt,
        name,
        notes: d.notes,
        exercises: [...d.exercises.values()],
      };
    });

  if (workouts.length === 0) warnings.add("No usable sets were found in the file.");
  return { source: opts.source, workouts, weighIns: [], warnings: warnings.result() };
}
