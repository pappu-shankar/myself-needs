import catalog from "../../data/exercise-catalog.json";
import type { ExerciseMode } from "../../gym-types";
import { seedCatalogRows, type NewGymExercise } from "../../db/queries/gym/catalog";

interface CatalogEntry {
  key: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondary: string[];
  steps: string[];
  mode: string;
  bodyweight: boolean;
  unilateral: boolean;
}

export const CATALOG_SIZE = catalog.exercises.length;

export function toExerciseRow(entry: CatalogEntry): NewGymExercise {
  return {
    catalogKey: entry.key,
    name: entry.name,
    bodyPart: entry.bodyPart,
    equipment: entry.equipment,
    target: entry.target,
    secondaryMuscles: entry.secondary,
    instructions: entry.steps,
    defaultMode: entry.mode as ExerciseMode,
    isBodyweight: entry.bodyweight,
    isUnilateral: entry.unilateral,
  };
}

const ROWS: NewGymExercise[] = (catalog.exercises as CatalogEntry[]).map(toExerciseRow);

/**
 * Makes sure the bundled exercise catalog is in `health_exercises`. Every
 * service read that lists or resolves exercises calls this first, so no page
 * has to remember to. See docs/roadmap/phase-7-gym.md for why this is a
 * runtime seed rather than a migration.
 */
export function ensureExerciseCatalog(): void {
  seedCatalogRows(ROWS);
}
