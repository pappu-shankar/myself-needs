/**
 * Plate math for a barbell. Everything runs in integer grams — 1.25 kg plates
 * and 0.1 + 0.2 float drift don't mix — and a "pair" is one plate per side.
 */

export interface PlateLoad {
  /** Plates for ONE side, heaviest first. */
  plates: number[];
  /** Bar + every plate on both sides. */
  loadedKg: number;
  /** Target − loaded: what couldn't be made (negative when the empty bar is
   * already heavier than the target). */
  remainderKg: number;
  exact: boolean;
}

function grams(kg: number): number {
  return Math.round(kg * 1000);
}

/** Distinct positive plate sizes in grams, heaviest first. */
function sizesOf(platesKg: readonly number[]): number[] {
  return [...new Set(platesKg.map(grams).filter((g) => g > 0))].sort((a, b) => b - a);
}

/**
 * Plates per side for `targetKg`, greedily heaviest first. Plates are
 * unlimited unless `inventory` caps a size (pairs available, keyed by plate
 * kg); sizes it doesn't mention stay unlimited, so only the scarce ones need
 * listing. Below the bar → the bar alone, not exact.
 */
export function platesPerSide(
  targetKg: number,
  barKg: number,
  platesKg: readonly number[],
  inventory?: Readonly<Record<number, number>>,
): PlateLoad {
  const barG = grams(barKg);
  const targetG = Number.isFinite(targetKg) ? grams(targetKg) : barG;
  if (targetG < barG) {
    return {
      plates: [],
      loadedKg: barG / 1000,
      remainderKg: (targetG - barG) / 1000,
      exact: false,
    };
  }
  const plates: number[] = [];
  let remainingG = targetG - barG;
  for (const sizeG of sizesOf(platesKg)) {
    const available = inventory?.[sizeG / 1000] ?? Number.POSITIVE_INFINITY;
    const pairs = Math.min(Math.floor(remainingG / (2 * sizeG)), Math.max(0, available));
    for (let i = 0; i < pairs; i++) plates.push(sizeG / 1000);
    remainingG -= pairs * 2 * sizeG;
  }
  return {
    plates,
    loadedKg: (targetG - remainingG) / 1000,
    remainderKg: remainingG / 1000,
    exact: remainingG === 0,
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Beyond this many grid cells the exact search isn't worth it; greedy answers instead. */
const MAX_CELLS = 2_000_000;

/**
 * The loadable total closest to `targetKg` with unlimited plates — "down"
 * never goes over (a prescription you can't load is rounded toward safety),
 * "nearest" picks the closer side, ties going down. Exact over every plate
 * combination, not greedy, so odd plate sets still find the best load.
 */
export function nearestLoadable(
  targetKg: number,
  barKg: number,
  platesKg: readonly number[],
  direction: "down" | "nearest",
): number {
  const barG = grams(barKg);
  const sizes = sizesOf(platesKg);
  if (!Number.isFinite(targetKg) || grams(targetKg) <= barG || sizes.length === 0) {
    return barG / 1000;
  }
  // Every load is the bar plus whole pairs; the gcd of the pair weights is the finest grid.
  const pairs = sizes.map((g) => 2 * g);
  const unit = pairs.reduce(gcd);
  const diff = grams(targetKg) - barG;
  const below = Math.floor(diff / unit);
  const limit = Math.ceil(diff / unit) + Math.max(...pairs) / unit;
  if (limit > MAX_CELLS) return platesPerSide(targetKg, barKg, platesKg).loadedKg;

  const reachable = new Uint8Array(limit + 1);
  reachable[0] = 1;
  for (const pair of pairs) {
    const step = pair / unit;
    for (let cell = step; cell <= limit; cell++) {
      if (reachable[cell - step]) reachable[cell] = 1;
    }
  }
  let down = below;
  while (down > 0 && !reachable[down]) down--;
  const downG = barG + down * unit;
  if (direction === "down") return downG / 1000;

  let up = Math.ceil(diff / unit);
  while (up < limit && !reachable[up]) up++;
  const upG = barG + up * unit;
  const targetG = barG + diff;
  return (upG - targetG < targetG - downG ? upG : downG) / 1000;
}
