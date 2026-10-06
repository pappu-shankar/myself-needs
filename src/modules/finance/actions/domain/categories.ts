"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { zId, zText } from "@/lib/validation";
import {
  createCategory,
  deleteCategoryById,
  editCategory,
  archiveCategoryById,
  unarchiveCategoryById,
} from "../../service/domain/categories";
import { CATEGORY_TYPES } from "../../types";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(CATEGORY_TYPES),
  parentCategoryId: z.coerce.number().int().optional(),
});

export interface AddCategoryState {
  error?: string;
}

export const addCategoryAction = defineFormAction(
  async (_prevState: AddCategoryState, formData: FormData): Promise<AddCategoryState> => {
    const parsed = categorySchema.safeParse({
      name: formData.get("name"),
      type: formData.get("type"),
      parentCategoryId: formData.get("parentCategoryId") || undefined,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid category" };
    }

    createCategory({
      name: parsed.data.name,
      type: parsed.data.type,
      parentCategoryId: parsed.data.parentCategoryId ?? null,
    });

    revalidatePath("/finance");
    revalidatePath("/finance/categories");
    return {};
  },
);

/**
 * Edit / delete. There is no archive action: `finance_categories` has no
 * `archived_at` column, so a category history references can only be renamed,
 * not retired. Noted in the service.
 */
export const editCategoryAction = defineFormAction(
  z.object({
    id: zId,
    name: zText("Name").optional(),
    type: z.enum(CATEGORY_TYPES).optional(),
    /** Sent as the literal string "none" to clear the parent, since an absent
     * field means "unchanged" rather than "no parent". */
    parentCategoryId: z.union([zId, z.literal("none")]).optional(),
  }),
  (input) => {
    editCategory(input.id, {
      name: input.name,
      type: input.type,
      parentCategoryId:
        input.parentCategoryId === undefined
          ? undefined
          : input.parentCategoryId === "none"
            ? null
            : input.parentCategoryId,
    });
  },
  { name: "finance:edit-category" },
);

/** Refused by the service when transactions, budgets, recurring rules or
 * sub-categories reference it. */
export const deleteCategoryAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    deleteCategoryById(input.id);
  },
  { name: "finance:delete-category" },
);

/** The answer to a refused delete: retire the category, keep the history. */
export const archiveCategoryAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    archiveCategoryById(input.id);
  },
  { name: "finance:archive-category" },
);

export const unarchiveCategoryAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    unarchiveCategoryById(input.id);
  },
  { name: "finance:unarchive-category" },
);
