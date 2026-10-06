import { MUSCLES, type Muscle, type MuscleWeights } from "../gym-types";

/**
 * Which body-map muscles an exercise trains, and how much.
 *
 * The exercise dataset names muscles in free text and isn't consistent
 * ("delts" / "deltoids" / "shoulders", "quads" / "quadriceps", "lats" /
 * "latissimus dorsi"). Every spelling it uses collapses onto the 18 muscles
 * the body map can draw; undrawable ones (hands, ankles, "cardiovascular
 * system") map to null and are dropped rather than guessed.
 */
const ALIAS: Record<string, Muscle | null> = {
  // primary targets
  abs: "abs",
  pectorals: "chest",
  biceps: "biceps",
  glutes: "gluteal",
  delts: "deltoids",
  triceps: "triceps",
  "upper back": "upper-back",
  lats: "upper-back",
  calves: "calves",
  quads: "quadriceps",
  forearms: "forearm",
  hamstrings: "hamstring",
  spine: "lower-back",
  traps: "trapezius",
  adductors: "adductors",
  "serratus anterior": "serratus",
  abductors: "gluteal",
  "levator scapulae": "trapezius",
  "cardiovascular system": null,
  // secondary muscles
  shoulders: "deltoids",
  deltoids: "deltoids",
  "rear deltoids": "deltoids",
  "rotator cuff": "deltoids",
  quadriceps: "quadriceps",
  core: "abs",
  abdominals: "abs",
  "lower abs": "abs",
  chest: "chest",
  "upper chest": "chest",
  "hip flexors": "hip-flexors",
  obliques: "obliques",
  "lower back": "lower-back",
  rhomboids: "upper-back",
  trapezius: "trapezius",
  back: "upper-back",
  "latissimus dorsi": "upper-back",
  brachialis: "biceps",
  soleus: "calves",
  shins: "tibialis",
  wrists: "forearm",
  "wrist flexors": "forearm",
  "wrist extensors": "forearm",
  "grip muscles": "forearm",
  groin: "adductors",
  "inner thighs": "adductors",
  ankles: null,
  "ankle stabilizers": null,
  feet: null,
  hands: null,
  sternocleidomastoid: null,
  // custom exercises can name a body-map muscle directly
  "upper-back": "upper-back",
  "lower-back": "lower-back",
  gluteal: "gluteal",
  hamstring: "hamstring",
  forearm: "forearm",
  serratus: "serratus",
  "hip-flexors": "hip-flexors",
  tibialis: "tibialis",
};

/** Custom exercises often carry only a body part; weights within a part sum to 1. */
const BY_BODY_PART: Record<string, MuscleWeights> = {
  chest: { chest: 1 },
  back: { "upper-back": 0.75, "lower-back": 0.25 },
  shoulders: { deltoids: 1 },
  "upper arms": { biceps: 0.5, triceps: 0.5 },
  "lower arms": { forearm: 1 },
  waist: { abs: 0.7, obliques: 0.3 },
  "upper legs": { quadriceps: 0.4, hamstring: 0.35, gluteal: 0.25 },
  "lower legs": { calves: 0.8, tibialis: 0.2 },
  neck: { trapezius: 1 },
  cardio: {},
};

/** A supporting muscle gets half a set's credit — the common "fractional sets" convention. */
export const SECONDARY_WEIGHT = 0.5;

export function muscleOf(name: string): Muscle | null {
  return ALIAS[name.toLowerCase().trim()] ?? null;
}

/** Muscles one exercise trains: `{ muscle: 0…1 }` (1 = primary mover). */
export function musclesOf(exercise: {
  target: string;
  secondaryMuscles: readonly string[];
  bodyPart: string;
}): MuscleWeights {
  const out: MuscleWeights = {};
  const add = (name: string, weight: number) => {
    const muscle = muscleOf(name);
    if (muscle) out[muscle] = Math.max(out[muscle] ?? 0, weight);
  };
  add(exercise.target, 1);
  for (const name of exercise.secondaryMuscles) add(name, SECONDARY_WEIGHT);
  if (Object.keys(out).length === 0) {
    Object.assign(out, BY_BODY_PART[exercise.bodyPart.toLowerCase().trim()] ?? {});
  }
  return out;
}

/** The primary muscle, if the exercise has a drawable one. */
export function primaryMuscleOf(exercise: { target: string; bodyPart: string }): Muscle | null {
  const direct = muscleOf(exercise.target);
  if (direct) return direct;
  const fallback = BY_BODY_PART[exercise.bodyPart.toLowerCase().trim()] ?? {};
  const ranked = (Object.entries(fallback) as [Muscle, number][]).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? null;
}

/**
 * Training load per muscle in "effective sets": each item's set count times
 * its muscle weights. Volume in kg is deliberately not used — 100 kg of leg
 * press vs 12 kg of lateral raise says nothing about which muscle worked harder.
 */
export function muscleLoad(
  items: ReadonlyArray<{ muscles: MuscleWeights; sets: number }>,
): Partial<Record<Muscle, number>> {
  const load: Partial<Record<Muscle, number>> = {};
  for (const { muscles, sets } of items) {
    if (!sets) continue;
    for (const [muscle, weight] of Object.entries(muscles) as [Muscle, number][]) {
      load[muscle] = (load[muscle] ?? 0) + weight * sets;
    }
  }
  return load;
}

export type MuscleLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Shade buckets 0–4 per muscle, relative to the hardest-worked muscle in the
 * same window — the map answers "is my training balanced", which only means
 * something as a comparison within one period.
 */
export function muscleLevels(load: Partial<Record<Muscle, number>>): Record<Muscle, MuscleLevel> {
  const max = Math.max(0, ...MUSCLES.map((m) => load[m] ?? 0));
  const levels = {} as Record<Muscle, MuscleLevel>;
  for (const muscle of MUSCLES) {
    const value = load[muscle] ?? 0;
    levels[muscle] =
      value <= 0 || max <= 0
        ? 0
        : (Math.max(1, Math.min(4, Math.ceil((value / max) * 4))) as MuscleLevel);
  }
  return levels;
}

/** Muscles hardest-worked first; untrained ones after, in head-to-toe order. */
export function rankMuscles(load: Partial<Record<Muscle, number>>): {
  worked: Muscle[];
  missed: Muscle[];
} {
  const worked = MUSCLES.filter((m) => (load[m] ?? 0) > 0).sort(
    (a, b) => (load[b] ?? 0) - (load[a] ?? 0),
  );
  const missed = MUSCLES.filter((m) => !((load[m] ?? 0) > 0));
  return { worked, missed };
}
