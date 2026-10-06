import { DomainError } from "@/modules/core/errors";
import catalog from "../../data/exercise-catalog.json";
import type { LoadingScheme, ProgressionPolicy, Weekday } from "../../gym-types";
import { listExerciseRowsByCatalogKeys } from "../../db/queries/gym/exercises";
import { inTransaction } from "../../db/queries/gym/routines";
import { ensureExerciseCatalog } from "./catalog";
import { addRoutineEntry, createRoutine, uniqueRoutineName } from "./routines";
import { clearWeekSchedule, setWeekdayRoutine } from "./schedule";

/**
 * Starter programs, defined in code against catalog keys (dataset ids, so they
 * survive a catalog regeneration). Applying one creates ordinary routines the
 * user then owns and edits. Every key is checked against the bundled catalog
 * by templates.test.ts.
 */

interface TemplateEntry {
  /** Catalog key in data/exercise-catalog.json. */
  key: string;
  sets: number;
  reps?: number;
  /** Bottom of the rep range (double progression). */
  repsMin?: number;
  durationSec?: number;
  restSec?: number;
  policy?: ProgressionPolicy;
  scheme?: LoadingScheme;
}

interface TemplateDay {
  name: string;
  /** Weekdays (0 = Sunday) this day lands on when the week is assigned. */
  weekdays: Weekday[];
  entries: TemplateEntry[];
}

interface Template {
  key: string;
  name: string;
  /** Routine-name prefix: "PPL — Push". */
  prefix: string;
  description: string;
  policy: ProgressionPolicy;
  days: TemplateDay[];
}

const HEAVY_REST = 180;

// Catalog keys used below, named once so the templates read as exercises.
const K = {
  benchPress: "0025",
  overheadPress: "1456",
  inclineDumbbellPress: "0314",
  lateralRaise: "0334",
  cablePushdown: "0201",
  lyingTricepsExtension: "0061",
  barbellRow: "0027",
  dumbbellRow: "0293",
  pullUp: "0652",
  chinUp: "1326",
  latPulldown: "2330",
  seatedCableRow: "0861",
  rearLateralRaise: "0348",
  barbellCurl: "0031",
  hammerCurl: "0313",
  squat: "0043",
  frontSquat: "0042",
  romanianDeadlift: "0085",
  deadlift: "0032",
  legExtension: "0585",
  legCurl: "0586",
  calfRaise: "0594",
  lunge: "0336",
  hangingLegRaise: "0472",
  plank: "2135",
} as const;

const range = (key: string, sets: number, repsMin: number, reps: number): TemplateEntry => ({
  key,
  sets,
  repsMin,
  reps,
});

const TEMPLATES: readonly Template[] = [
  {
    key: "ppl",
    name: "Push / Pull / Legs",
    prefix: "PPL",
    description:
      "Three days split by movement — presses, pulls, legs. Rep ranges with double progression. Planned Mon / Wed / Fri; run it twice through for six days a week.",
    policy: "double",
    days: [
      {
        name: "Push",
        weekdays: [1],
        entries: [
          range(K.benchPress, 4, 6, 10),
          range(K.overheadPress, 3, 6, 10),
          range(K.inclineDumbbellPress, 3, 8, 12),
          range(K.lateralRaise, 3, 12, 15),
          range(K.cablePushdown, 3, 10, 15),
        ],
      },
      {
        name: "Pull",
        weekdays: [3],
        entries: [
          range(K.barbellRow, 4, 6, 10),
          range(K.pullUp, 3, 6, 10),
          range(K.seatedCableRow, 3, 8, 12),
          range(K.rearLateralRaise, 3, 12, 15),
          range(K.barbellCurl, 3, 8, 12),
          range(K.hammerCurl, 2, 10, 12),
        ],
      },
      {
        name: "Legs",
        weekdays: [5],
        entries: [
          range(K.squat, 4, 6, 10),
          range(K.romanianDeadlift, 3, 8, 12),
          range(K.legExtension, 3, 10, 15),
          range(K.legCurl, 3, 10, 15),
          range(K.calfRaise, 3, 12, 15),
        ],
      },
    ],
  },
  {
    key: "upper_lower",
    name: "Upper / Lower",
    prefix: "Upper/Lower",
    description:
      "Four days: two upper-body and two lower-body sessions, each muscle twice a week. Rep ranges with double progression. Planned Mon / Tue / Thu / Fri.",
    policy: "double",
    days: [
      {
        name: "Upper A",
        weekdays: [1],
        entries: [
          range(K.benchPress, 4, 5, 8),
          range(K.barbellRow, 4, 6, 10),
          range(K.overheadPress, 3, 8, 10),
          range(K.latPulldown, 3, 8, 12),
          range(K.cablePushdown, 2, 10, 15),
          range(K.barbellCurl, 2, 10, 15),
        ],
      },
      {
        name: "Lower A",
        weekdays: [2],
        entries: [
          range(K.squat, 4, 5, 8),
          range(K.romanianDeadlift, 3, 8, 10),
          range(K.legExtension, 3, 10, 15),
          range(K.calfRaise, 3, 12, 15),
          range(K.hangingLegRaise, 3, 10, 15),
        ],
      },
      {
        name: "Upper B",
        weekdays: [4],
        entries: [
          range(K.overheadPress, 4, 5, 8),
          range(K.pullUp, 4, 6, 10),
          range(K.inclineDumbbellPress, 3, 8, 12),
          range(K.seatedCableRow, 3, 8, 12),
          range(K.lateralRaise, 3, 12, 15),
          range(K.hammerCurl, 2, 10, 12),
        ],
      },
      {
        name: "Lower B",
        weekdays: [5],
        entries: [
          range(K.deadlift, 3, 4, 6),
          range(K.frontSquat, 3, 6, 10),
          range(K.legCurl, 3, 10, 15),
          range(K.lunge, 3, 8, 12),
          range(K.calfRaise, 3, 12, 15),
          { key: K.plank, sets: 3, durationSec: 45 },
        ],
      },
    ],
  },
  {
    key: "full_body",
    name: "Full Body",
    prefix: "Full Body",
    description:
      "Three whole-body sessions a week — a squat or hinge, a press and a pull every time. Linear progression. Planned Mon / Wed / Fri.",
    policy: "linear",
    days: [
      {
        name: "A",
        weekdays: [1],
        entries: [
          { key: K.squat, sets: 3, reps: 8 },
          { key: K.benchPress, sets: 3, reps: 8 },
          { key: K.barbellRow, sets: 3, reps: 8 },
          { key: K.lateralRaise, sets: 2, reps: 12 },
          { key: K.plank, sets: 3, durationSec: 45 },
        ],
      },
      {
        name: "B",
        weekdays: [3],
        entries: [
          { key: K.deadlift, sets: 3, reps: 5 },
          { key: K.overheadPress, sets: 3, reps: 8 },
          { key: K.pullUp, sets: 3, reps: 8 },
          { key: K.lunge, sets: 2, reps: 10 },
          { key: K.barbellCurl, sets: 2, reps: 12 },
        ],
      },
      {
        name: "C",
        weekdays: [5],
        entries: [
          { key: K.frontSquat, sets: 3, reps: 8 },
          { key: K.inclineDumbbellPress, sets: 3, reps: 10 },
          { key: K.seatedCableRow, sets: 3, reps: 10 },
          { key: K.romanianDeadlift, sets: 3, reps: 10 },
          { key: K.hangingLegRaise, sets: 3, reps: 12 },
        ],
      },
    ],
  },
  {
    key: "five_by_five",
    name: "5×5 (A/B)",
    prefix: "5×5",
    description:
      "StrongLifts-style: two alternating workouts of heavy 5×5 compounds, weight up every session you complete. Planned Mon A / Wed B / Fri A — swap A and B the next week with a date override.",
    policy: "linear",
    days: [
      {
        name: "A",
        weekdays: [1, 5],
        entries: [
          { key: K.squat, sets: 5, reps: 5, restSec: HEAVY_REST },
          { key: K.benchPress, sets: 5, reps: 5, restSec: HEAVY_REST },
          { key: K.barbellRow, sets: 5, reps: 5, restSec: HEAVY_REST },
        ],
      },
      {
        name: "B",
        weekdays: [3],
        entries: [
          { key: K.squat, sets: 5, reps: 5, restSec: HEAVY_REST },
          { key: K.overheadPress, sets: 5, reps: 5, restSec: HEAVY_REST },
          { key: K.deadlift, sets: 1, reps: 5, restSec: HEAVY_REST },
        ],
      },
    ],
  },
  {
    key: "greyskull",
    name: "Greyskull LP (A/B)",
    prefix: "Greyskull LP",
    description:
      "Two straight sets of 5 and a final set to failure; beat the target and the weight goes up, fail and it resets 10 %. Planned Mon A / Wed B / Fri A — alternate with a date override.",
    policy: "greyskull",
    days: [
      {
        name: "A",
        weekdays: [1, 5],
        entries: [
          { key: K.benchPress, sets: 3, reps: 5, restSec: HEAVY_REST },
          { key: K.barbellRow, sets: 3, reps: 5, restSec: HEAVY_REST },
          { key: K.squat, sets: 3, reps: 5, restSec: HEAVY_REST },
        ],
      },
      {
        name: "B",
        weekdays: [3],
        entries: [
          { key: K.overheadPress, sets: 3, reps: 5, restSec: HEAVY_REST },
          { key: K.chinUp, sets: 3, reps: 5, restSec: HEAVY_REST },
          { key: K.deadlift, sets: 1, reps: 5, restSec: HEAVY_REST },
        ],
      },
    ],
  },
  {
    key: "wendler_bbb",
    name: "5/3/1 Boring But Big",
    prefix: "5/3/1 BBB",
    description:
      "Four days, one main lift each: the 5/3/1 sets off your training max, then 5×10 of the same lift and one accessory. Set training maxes and start a 5/3/1 program before the first session. Planned Mon / Tue / Thu / Fri.",
    policy: "off",
    days: [
      {
        name: "Press",
        weekdays: [1],
        entries: [
          { key: K.overheadPress, sets: 3, reps: 5, scheme: "wendler_main", restSec: HEAVY_REST },
          { key: K.overheadPress, sets: 5, reps: 10, scheme: "wendler_bbb" },
          { ...range(K.chinUp, 5, 6, 10), policy: "double" },
        ],
      },
      {
        name: "Deadlift",
        weekdays: [2],
        entries: [
          { key: K.deadlift, sets: 3, reps: 5, scheme: "wendler_main", restSec: HEAVY_REST },
          { key: K.deadlift, sets: 5, reps: 10, scheme: "wendler_bbb" },
          { ...range(K.hangingLegRaise, 5, 10, 15), policy: "double" },
        ],
      },
      {
        name: "Bench",
        weekdays: [4],
        entries: [
          { key: K.benchPress, sets: 3, reps: 5, scheme: "wendler_main", restSec: HEAVY_REST },
          { key: K.benchPress, sets: 5, reps: 10, scheme: "wendler_bbb" },
          { ...range(K.dumbbellRow, 5, 8, 10), policy: "double" },
        ],
      },
      {
        name: "Squat",
        weekdays: [5],
        entries: [
          { key: K.squat, sets: 3, reps: 5, scheme: "wendler_main", restSec: HEAVY_REST },
          { key: K.squat, sets: 5, reps: 10, scheme: "wendler_bbb" },
          { ...range(K.legCurl, 5, 8, 10), policy: "double" },
        ],
      },
    ],
  },
];

export const TEMPLATE_KEYS = TEMPLATES.map((template) => template.key);

export interface TemplateSummary {
  key: string;
  name: string;
  description: string;
  days: Array<{ name: string; weekdays: Weekday[]; exercises: string[] }>;
}

let catalogNames: Map<string, string> | undefined;

function catalogName(key: string): string {
  catalogNames ??= new Map(catalog.exercises.map((e) => [e.key, e.name]));
  return catalogNames.get(key) ?? key;
}

/** Every catalog key the templates use — for the test that pins them to the dataset. */
export function templateCatalogKeys(): string[] {
  return [...new Set(TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.entries.map((e) => e.key))))];
}

export function listTemplates(): TemplateSummary[] {
  return TEMPLATES.map((template) => ({
    key: template.key,
    name: template.name,
    description: template.description,
    days: template.days.map((day) => ({
      name: day.name,
      weekdays: [...day.weekdays],
      exercises: day.entries.map((entry) => catalogName(entry.key)),
    })),
  }));
}

/**
 * Creates the template's routines (names kept distinct from existing ones)
 * and, with `assignWeek`, replaces the weekly plan with the template's days.
 * Returns the new routine ids in day order.
 */
export function applyTemplate(
  key: string,
  options: { assignWeek: boolean },
): { routineIds: number[] } {
  const template = TEMPLATES.find((t) => t.key === key);
  if (!template) throw new DomainError("That starter program doesn't exist.");

  ensureExerciseCatalog();
  const keys = [...new Set(template.days.flatMap((day) => day.entries.map((e) => e.key)))];
  const idByKey = new Map(
    listExerciseRowsByCatalogKeys(keys).map((row) => [row.catalogKey as string, row.id]),
  );
  const missing = keys.filter((k) => !idByKey.has(k));
  if (missing.length) {
    throw new DomainError(
      `The exercise library is missing ${missing.join(", ")} — this template can't be built.`,
    );
  }

  return inTransaction(() => {
    const routineIds = template.days.map((day) => {
      const routine = createRoutine({
        name: uniqueRoutineName(`${template.prefix} — ${day.name}`),
        notes: `From the ${template.name} starter program.`,
        progressionPolicy: template.policy,
      });
      for (const entry of day.entries) {
        addRoutineEntry(routine.id, idByKey.get(entry.key)!, {
          sets: entry.sets,
          ...(entry.reps !== undefined && { reps: entry.reps }),
          ...(entry.repsMin !== undefined && { repsMin: entry.repsMin }),
          ...(entry.durationSec !== undefined && { durationSec: entry.durationSec }),
          ...(entry.restSec !== undefined && { restSec: entry.restSec }),
          ...(entry.policy !== undefined && { progressionPolicy: entry.policy }),
          ...(entry.scheme !== undefined && { scheme: entry.scheme }),
        });
      }
      return routine.id;
    });

    if (options.assignWeek) {
      clearWeekSchedule();
      template.days.forEach((day, index) => {
        for (const weekday of day.weekdays) setWeekdayRoutine(weekday, routineIds[index]);
      });
    }
    return { routineIds };
  });
}
