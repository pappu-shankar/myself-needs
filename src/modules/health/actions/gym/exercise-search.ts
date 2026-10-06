"use server";

import { z } from "zod";
import { defineAction } from "@/modules/core/action/define-action";
import { MUSCLES } from "../../gym-types";
import { listExercises } from "../../service/gym/exercises";
import { getTrainingMaxSuggestion } from "../../service/gym/analytics";

export interface ExerciseSearchResult {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  defaultMode: "reps" | "time" | "cardio";
  isBodyweight: boolean;
  isFavorite: boolean;
  isCustom: boolean;
}

/** Read-only search for the exercise picker (routine editor, live workout). */
export const searchExercisesAction = defineAction(
  z.object({
    query: z.string().max(100).optional(),
    bodyPart: z.string().max(40).optional(),
    equipment: z.string().max(40).optional(),
    muscle: z.enum(MUSCLES).optional(),
    favoritesOnly: z.boolean().optional(),
    ownedEquipmentOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  (input) => {
    const page = listExercises({ ...input, limit: input.limit ?? 30 });
    return {
      total: page.total,
      rows: page.rows.map((e): ExerciseSearchResult => ({
        id: e.id,
        name: e.name,
        bodyPart: e.bodyPart,
        equipment: e.equipment,
        target: e.target,
        defaultMode: e.defaultMode,
        isBodyweight: e.isBodyweight,
        isFavorite: e.isFavorite,
        isCustom: e.isCustom,
      })),
    };
  },
  { name: "health:search-exercises", revalidate: false, readOnly: true },
);

/** A training-max suggestion for any lift, e.g. one just picked in the programs page. */
export const suggestTrainingMaxAction = defineAction(
  z.object({ exerciseId: z.number().int().positive() }),
  ({ exerciseId }) => getTrainingMaxSuggestion(exerciseId),
  { name: "health:suggest-training-max", revalidate: false, readOnly: true },
);
