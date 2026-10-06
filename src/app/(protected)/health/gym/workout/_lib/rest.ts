/**
 * Rest-timer math and the superset rest rule — pure, so the timer component
 * only wires them to the clock and the store.
 */

export interface RestTimer {
  workoutId: number;
  /** The set whose completion started it (so a failed save can cancel its own timer). */
  setId: number;
  /** Epoch ms when the rest is over. */
  endAt: number;
  /** Full length in seconds (grows/shrinks with ±15 s), for the progress bar. */
  totalSec: number;
}

/** Whole seconds left, rounded up so the display reads 0:01 until it's really over. */
export function remainingSec(endAt: number, now: number): number {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

/** A new countdown, or null when the rest is 0 s (no timer). */
export function startRest(
  workoutId: number,
  setId: number,
  seconds: number,
  now: number,
): RestTimer | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return { workoutId, setId, endAt: now + seconds * 1000, totalSec: seconds };
}

/** ±seconds on a running timer; shortening it to nothing ends it (null). */
export function adjustRest(timer: RestTimer, deltaSec: number, now: number): RestTimer | null {
  const endAt = Math.max(timer.endAt, now) + deltaSec * 1000;
  if (endAt <= now) return null;
  const left = Math.ceil((endAt - now) / 1000);
  return { ...timer, endAt, totalSec: Math.max(left, timer.totalSec + deltaSec) };
}

/** 0–1 of the rest already taken. */
export function restProgress(timer: RestTimer, now: number): number {
  if (timer.totalSec <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (timer.endAt - now) / (timer.totalSec * 1000)));
}

/** A stored timer, validated — anything malformed reads as "no timer". */
export function parseStoredRest(raw: string | null): RestTimer | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { workoutId, setId, endAt, totalSec } = value as Record<string, unknown>;
    const numbers = [workoutId, setId, endAt, totalSec];
    if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    return {
      workoutId: workoutId as number,
      setId: setId as number,
      endAt: endAt as number,
      totalSec: totalSec as number,
    };
  } catch {
    return null;
  }
}

/** The entry's own rest, else the default from gym settings. */
export function restSecondsFor(entry: { restSec: number | null }, defaultRestSec: number): number {
  return entry.restSec ?? defaultRestSec;
}

export interface Block<T> {
  /** The superset group, or null for a lone exercise. */
  group: number | null;
  entries: T[];
}

/**
 * Entries (in position order) → blocks: adjacent entries sharing a superset
 * group form one block; everything else stands alone. Two separate runs of
 * the same group number are two blocks — only adjacency makes a superset.
 */
export function supersetBlocks<T extends { supersetGroup: number | null }>(
  entries: readonly T[],
): Block<T>[] {
  const blocks: Block<T>[] = [];
  for (const entry of entries) {
    const last = blocks[blocks.length - 1];
    if (entry.supersetGroup !== null && last && last.group === entry.supersetGroup) {
      last.entries.push(entry);
    } else {
      blocks.push({ group: entry.supersetGroup, entries: [entry] });
    }
  }
  return blocks.map((block) =>
    block.entries.length > 1 ? block : { group: null, entries: block.entries },
  );
}

/**
 * Whether finishing a set of `entryId` should start the rest timer. In a
 * superset you go straight to the next exercise and rest only after the
 * round: no rest while a later member of the group still has a set to do.
 * (So the last member always rests, and when the others run out of sets the
 * remaining one rests between its own.)
 */
export function shouldRestAfter(
  entries: ReadonlyArray<{
    id: number;
    supersetGroup: number | null;
    sets: ReadonlyArray<{ completed: boolean }>;
  }>,
  entryId: number,
): boolean {
  const block = supersetBlocks(entries).find((b) => b.entries.some((e) => e.id === entryId));
  if (!block || block.group === null) return true;
  const index = block.entries.findIndex((e) => e.id === entryId);
  return !block.entries.slice(index + 1).some((e) => e.sets.some((s) => !s.completed));
}
