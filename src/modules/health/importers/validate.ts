/**
 * Tiny hand-rolled validators for the JSON file formats (plan file, backup).
 * `importers/` is isomorphic and may not import Zod's server-only siblings,
 * so each reader checks one value and throws a friendly `ImportFormatError`
 * naming the path to the offending field ("routines[2].entries[0].sets").
 */

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFormatError";
  }
}

export type Obj = Record<string, unknown>;

const fail = (path: string, what: string): never => {
  throw new ImportFormatError(`${path}: ${what}`);
};

export function readObject(value: unknown, path: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "expected an object");
  }
  return value as Obj;
}

export function readArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) return fail(path, "expected a list");
  if (value.length > max) return fail(path, `too many items (${value.length}, maximum ${max})`);
  return value;
}

export function readString(
  value: unknown,
  path: string,
  opts: { max?: number; min?: number } = {},
): string {
  if (typeof value !== "string") return fail(path, "expected text");
  const max = opts.max ?? 500;
  if (value.length > max) return fail(path, `too long (maximum ${max} characters)`);
  if (value.length < (opts.min ?? 0)) return fail(path, "must not be empty");
  return value;
}

export function readNullableString(value: unknown, path: string, max = 5000): string | null {
  if (value === null || value === undefined) return null;
  return readString(value, path, { max });
}

export function readNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, "expected a number");
  if (value < min || value > max) return fail(path, `must be between ${min} and ${max}`);
  return value;
}

export function readNullableNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined) return null;
  return readNumber(value, path, min, max);
}

export function readInt(value: unknown, path: string, min: number, max: number): number {
  const n = readNumber(value, path, min, max);
  if (!Number.isInteger(n)) return fail(path, "expected a whole number");
  return n;
}

export function readNullableInt(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined) return null;
  return readInt(value, path, min, max);
}

export function readBoolean(value: unknown, path: string, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") return fail(path, "expected true or false");
  return value;
}

export function readEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return fail(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** A local `YYYY-MM-DD` calendar date. */
export function readDate(value: unknown, path: string): string {
  const s = readString(value, path, { max: 10 });
  if (!DATE_RE.test(s) || !isRealDate(s)) return fail(path, "expected a date like 2024-05-01");
  return s;
}

/** A local `YYYY-MM-DDTHH:mm:ss` date-time. */
export function readDateTime(value: unknown, path: string): string {
  const s = readString(value, path, { max: 19 });
  if (!DATETIME_RE.test(s) || !isRealDate(s)) {
    return fail(path, "expected a date-time like 2024-05-01T07:30:00");
  }
  return s;
}
