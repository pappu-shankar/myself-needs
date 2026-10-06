/**
 * Maps exercise names written by other apps onto this app's catalog.
 *
 * Other apps bolt qualifiers on — Strong "Squat (Barbell)", Hevy "Leg Press
 * (Machine)", FitNotes "Lat Pulldown (Pulley)" — while the catalog writes
 * "Barbell Full Squat". So names are tokenised (parentheses unwrapped,
 * abbreviations expanded, plurals folded) and compared as a bag of words, so
 * word order and the equipment suffix stop mattering. Resolution order:
 *   1. exact bag of words                      (confidence 1)
 *   2. a small alias table of the common lifts (0.95) — an unqualified
 *      "Squat" or "Bench Press" means the canonical barbell lift
 *   3. fuzzy: every word of the query is in exactly one best candidate that has
 *      at most two extra words and the same equipment (≥ 0.6)
 * Anything less certain returns null: filing years of training under the
 * wrong lift is worse than a custom exercise the user can see and merge.
 * The alias idea (and "unqualified = barbell") follows openGym (AGPL-3.0).
 */
import type { BodyPart } from "../gym-types";

export interface MatchCandidate {
  id: number;
  name: string;
  equipment: string;
}

export interface NameMatch {
  id: number;
  /** 0–1. */
  confidence: number;
}

const EXPANSIONS: Record<string, string[]> = {
  bb: ["barbell"],
  db: ["dumbbell"],
  dumbell: ["dumbbell"],
  dumbbells: ["dumbbell"],
  kb: ["kettlebell"],
  ohp: ["overhead", "press"],
  rdl: ["romanian", "deadlift"],
  bw: ["bodyweight"],
  lever: ["machine"],
  leverage: ["machine"],
  skullcrusher: ["skull", "crusher"],
  triceps: ["tricep"],
  biceps: ["bicep"],
  pulldowns: ["pulldown"],
  ups: ["up"],
  pullups: ["pull", "up"],
  pullup: ["pull", "up"],
  chinups: ["chin", "up"],
  chinup: ["chin", "up"],
  pushups: ["push", "up"],
  pushup: ["push", "up"],
  situps: ["sit", "up"],
  situp: ["sit", "up"],
};

/** Words that say nothing about which exercise this is. */
const FILLER = new Set([
  "the",
  "a",
  "with",
  "and",
  "v",
  "variation",
  "version",
  "pulley",
  "flat",
  "standing",
  "bodyweight",
  "male",
  "female",
]);

/** The words that name equipment, once normalised. */
const EQUIPMENT_WORDS = new Set([
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "smith",
  "kettlebell",
  "ezbar",
  "band",
  "trapbar",
]);

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  if (word.endsWith("ses") || word.endsWith("ches") || word.endsWith("shes")) {
    return word.slice(0, -2);
  }
  return word.endsWith("s") ? word.slice(0, -1) : word;
}

/** The significant words of a name, in order. */
export function exerciseTokens(name: string): string[] {
  let s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  s = s
    .replace(/\bsmith machine\b/g, "smith")
    .replace(/\bez[ -]?(?:bar|barbell|curl bar)\b/g, "ezbar")
    .replace(/\btrap bar\b/g, "trapbar")
    .replace(/\bhex bar\b/g, "trapbar")
    .replace(/\bolympic barbell\b/g, "barbell")
    .replace(/\bresistance band\b/g, "band")
    .replace(/\bbody ?weight\b/g, "bodyweight");
  const out: string[] = [];
  for (const raw of s.split(" ")) {
    if (!raw) continue;
    for (const w of EXPANSIONS[raw] ?? [raw]) {
      const word = singular(w);
      if (!FILLER.has(word)) out.push(word);
    }
  }
  return out;
}

/** Order-insensitive key: sorted, de-duplicated tokens. */
export function normalizeExerciseName(name: string): string {
  return [...new Set(exerciseTokens(name))].sort().join(" ");
}

/** Equipment field of a catalog row → the same vocabulary as {@link EQUIPMENT_WORDS}. */
function equipmentGroup(equipment: string): string | null {
  const e = equipment.toLowerCase();
  if (e.includes("smith")) return "smith";
  if (e.includes("ez")) return "ezbar";
  if (e.includes("trap")) return "trapbar";
  if (e.includes("barbell")) return "barbell";
  if (e.includes("dumbbell")) return "dumbbell";
  if (e.includes("kettlebell")) return "kettlebell";
  if (e.includes("cable")) return "cable";
  if (e.includes("band")) return "band";
  if (e.includes("machine") || e.includes("lever") || e.includes("sled") || e === "hammer") {
    return "machine";
  }
  return null;
}

/**
 * Curated aliases: source names (any equipment spelling) → the catalog exercise
 * they conventionally mean. Targets are matched by normalised name, so an entry
 * is simply ignored when the target isn't among the candidates.
 */
const ALIASES: Array<[string[], string]> = [
  [["bench press", "barbell bench press", "flat bench press", "bench"], "Barbell Bench Press"],
  [["incline bench press", "incline press"], "Barbell Incline Bench Press"],
  [["decline bench press"], "Barbell Decline Bench Press"],
  [["close grip bench press", "close-grip bench press"], "Barbell Close-Grip Bench Press"],
  [
    ["squat", "back squat", "barbell squat", "high bar squat", "low bar squat", "full squat"],
    "Barbell Full Squat",
  ],
  [["front squat"], "Barbell Front Squat"],
  [["deadlift", "conventional deadlift"], "Barbell Deadlift"],
  [["romanian deadlift", "rdl"], "Barbell Romanian Deadlift"],
  [["sumo deadlift"], "Barbell Sumo Deadlift"],
  [["stiff leg deadlift", "stiff legged deadlift"], "Barbell Straight Leg Deadlift"],
  [["pull up", "pullup", "pull ups"], "Pull-Up"],
  [["chin up", "chinup", "chin ups"], "Chin-Up"],
  [
    ["lat pulldown", "lat pull down", "pulldown", "wide grip lat pulldown"],
    "Cable Lat Pulldown Full Range Of Motion",
  ],
  [
    ["overhead press", "military press", "shoulder press", "ohp", "standing overhead press"],
    "Barbell Seated Overhead Press",
  ],
  [["seated overhead press", "seated shoulder press"], "Barbell Seated Overhead Press"],
  [["dumbbell shoulder press", "dumbbell overhead press"], "Dumbbell Seated Shoulder Press"],
  [["bent over row", "barbell row", "bent over barbell row", "row"], "Barbell Bent Over Row"],
  [
    ["dumbbell row", "one arm dumbbell row", "single arm dumbbell row"],
    "Dumbbell One Arm Bent-Over Row",
  ],
  [["seated row", "seated cable row", "cable row"], "Cable Seated Row"],
  [["t bar row"], "Lever T Bar Row"],
  [["leg press"], "Sled 45° Leg Press"],
  [["leg extension"], "Lever Leg Extension"],
  [["leg curl", "seated leg curl"], "Lever Seated Leg Curl"],
  [["lying leg curl"], "Lever Lying Leg Curl"],
  [["standing calf raise", "calf raise"], "Lever Standing Calf Raise"],
  [["seated calf raise"], "Lever Seated Calf Raise"],
  [["lateral raise", "side raise", "side lateral raise"], "Dumbbell Lateral Raise"],
  [["rear delt fly", "reverse fly", "rear delt raise"], "Dumbbell Reverse Fly"],
  [["bicep curl", "dumbbell curl", "biceps curl"], "Dumbbell Biceps Curl"],
  [["barbell curl", "curl"], "Barbell Curl"],
  [["hammer curl"], "Dumbbell Hammer Curl"],
  [["preacher curl"], "Barbell Preacher Curl"],
  [["tricep pushdown", "triceps pushdown", "pushdown", "tricep pushdown cable"], "Cable Pushdown"],
  [["skullcrusher", "skull crusher", "lying triceps extension"], "Barbell Lying Triceps Extension"],
  [["lunge", "lunges", "walking lunge"], "Walking Lunge"],
  [["shrug", "shrugs"], "Barbell Shrug"],
  [["dip", "dips", "chest dip", "tricep dip"], "Chest Dip"],
  [["push up", "pushup", "push ups"], "Push-Up"],
  [["cable fly", "cable crossover", "cable cross over"], "Cable Standing Fly"],
  [["dumbbell fly", "chest fly"], "Dumbbell Fly"],
  [["hip thrust", "glute bridge"], "Barbell Glute Bridge"],
  [["good morning"], "Barbell Good Morning"],
  [["goblet squat"], "Dumbbell Goblet Squat"],
  [["bulgarian split squat", "split squat"], "Dumbbell Single Leg Split Squat"],
  [["hanging leg raise"], "Hanging Leg Raise"],
  [["sit up", "situp"], "Sit-Up V. 2"],
  [["crunch", "crunches"], "Crunch Floor"],
  [["jump rope", "skipping rope"], "Jump Rope"],
  [["farmers walk", "farmer's walk", "farmers carry"], "Farmers Walk"],
];

const ALIAS_BY_KEY: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [sources, target] of ALIASES) {
    for (const s of sources) map.set(normalizeExerciseName(s), normalizeExerciseName(target));
  }
  return map;
})();

interface Prepared {
  candidate: MatchCandidate;
  tokens: Set<string>;
  key: string;
  group: string | null;
}

function prepare(candidates: readonly MatchCandidate[]): Prepared[] {
  return candidates.map((candidate) => {
    const tokens = new Set(exerciseTokens(candidate.name));
    return {
      candidate,
      tokens,
      key: [...tokens].sort().join(" "),
      group: equipmentGroup(candidate.equipment),
    };
  });
}

const preparedCache = new WeakMap<readonly MatchCandidate[], Prepared[]>();
function preparedFor(candidates: readonly MatchCandidate[]): Prepared[] {
  let p = preparedCache.get(candidates);
  if (!p || p.length !== candidates.length) {
    p = prepare(candidates);
    preparedCache.set(candidates, p);
  }
  return p;
}

/**
 * The candidate a foreign exercise name refers to, or null when no candidate is
 * a confident match. `candidates` should be the full exercise list (catalog +
 * custom); the same array may be passed repeatedly (preparation is cached).
 */
export function matchExercise(
  name: string,
  candidates: readonly MatchCandidate[],
): NameMatch | null {
  const tokens = [...new Set(exerciseTokens(name))];
  if (tokens.length === 0) return null;
  const key = [...tokens].sort().join(" ");
  const prepared = preparedFor(candidates);

  const exact = prepared.find((p) => p.key === key);
  if (exact) return { id: exact.candidate.id, confidence: 1 };

  // Alias: by the full name, else by the name minus its equipment words ("Squat
  // (Barbell)" -> "squat") provided the alias target uses that equipment.
  const wanted = tokens.filter((t) => EQUIPMENT_WORDS.has(t));
  const bare = tokens
    .filter((t) => !EQUIPMENT_WORDS.has(t))
    .sort()
    .join(" ");
  for (const aliasKey of [ALIAS_BY_KEY.get(key), bare ? ALIAS_BY_KEY.get(bare) : undefined]) {
    if (!aliasKey) continue;
    const hit = prepared.find((p) => p.key === aliasKey);
    if (hit && (wanted.length === 0 || (hit.group && wanted.includes(hit.group)))) {
      return { id: hit.candidate.id, confidence: 0.95 };
    }
  }

  // Fuzzy: all query words present, little left over, equipment agrees.
  const query = new Set(tokens);
  let best: Prepared | null = null;
  let bestExtra = Infinity;
  let ties = 0;
  for (const p of prepared) {
    let all = true;
    for (const t of query) {
      if (!p.tokens.has(t)) {
        all = false;
        break;
      }
    }
    if (!all) continue;
    if (wanted.length > 0 && !(p.group && wanted.includes(p.group))) continue;
    const extra = p.tokens.size - query.size;
    if (extra > 2) continue;
    if (extra < bestExtra) {
      best = p;
      bestExtra = extra;
      ties = 1;
    } else if (extra === bestExtra) ties++;
  }
  if (!best || ties !== 1) return null;
  const confidence = query.size / (query.size + bestExtra);
  return confidence >= 0.6
    ? { id: best.candidate.id, confidence: Math.min(0.9, confidence) }
    : null;
}

/* ------------------------------------------------- traits of unknown names */

export interface GuessedTraits {
  bodyPart: BodyPart | "other";
  equipment: string;
  target: string;
}

const BODY_PART_RULES: Array<[RegExp, GuessedTraits["bodyPart"], string]> = [
  [
    /\b(run|running|treadmill|bike|cycl|elliptical|swim|walk|jog|stair|rowing|ergometer|ski ?erg|jump rope|skipping|cardio|sprint|hike)/i,
    "cardio",
    "cardiovascular system",
  ],
  [/\b(calf|calves)\b/i, "lower legs", "calves"],
  [/\b(bench|chest|pec|fly|flye|push[- ]?up|dip|crossover)\b/i, "chest", "pectorals"],
  [
    /\b(pull[- ]?up|chin[- ]?up|pulldown|lat |row|deadlift|back|shrug|rack pull)\b/i,
    "back",
    "lats",
  ],
  [
    /\b(shoulder|overhead|military|lateral raise|delt|face pull|arnold|upright)\b/i,
    "shoulders",
    "delts",
  ],
  [/\b(tricep|triceps|skull|pushdown|kickback)\b/i, "upper arms", "triceps"],
  [/\b(bicep|biceps|curl|preacher)\b/i, "upper arms", "biceps"],
  [/\b(forearm|wrist|grip)\b/i, "lower arms", "forearms"],
  [
    /\b(squat|lunge|leg|quad|hamstring|glute|hip|thrust|step[- ]?up|good morning)\b/i,
    "upper legs",
    "quads",
  ],
  [
    /\b(crunch|plank|sit[- ]?up|\bab\b|abs|core|twist|oblique|russian|leg raise|v[- ]?up)\b/i,
    "waist",
    "abs",
  ],
  [/\b(neck)\b/i, "neck", "levator scapulae"],
];

/** Best-effort body part / equipment / primary muscle for a name with no catalog match. */
export function guessExerciseTraits(name: string): GuessedTraits {
  const tokens = exerciseTokens(name);
  const eq = tokens.find((t) => EQUIPMENT_WORDS.has(t));
  const equipment =
    eq === "machine"
      ? "leverage machine"
      : eq === "smith"
        ? "smith machine"
        : eq === "ezbar"
          ? "ez barbell"
          : eq === "trapbar"
            ? "trap bar"
            : (eq ?? (/\bbody ?weight\b/i.test(name) ? "body weight" : "other"));
  for (const [re, bodyPart, target] of BODY_PART_RULES) {
    if (re.test(name)) return { bodyPart, equipment, target };
  }
  return { bodyPart: "other", equipment, target: "other" };
}
