"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { createCategory } from "../../service/domain/categories";
import { CATEGORY_TYPES } from "../../types";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(CATEGORY_TYPES),
  parentCategoryId: z.coerce.number().int().optional(),
});

export interface AddCategoryState {
  error?: string;
}

export async function addCategoryAction(
  _prevState: AddCategoryState,
  formData: FormData,
): Promise<AddCategoryState> {
  await requireUnlocked();
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
}
