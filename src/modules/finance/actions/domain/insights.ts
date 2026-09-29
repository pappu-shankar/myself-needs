"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { dismissInsightById } from "../../service/domain/insights/engine";

const dismissSchema = z.object({
  id: z.string().min(1),
});

export interface DismissInsightState {
  error?: string;
}

export async function dismissInsightAction(
  _prevState: DismissInsightState,
  formData: FormData,
): Promise<DismissInsightState> {
  await requireUnlocked();
  const parsed = dismissSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid insight" };
  }

  dismissInsightById(parsed.data.id);
  revalidatePath("/finance/insights");
  revalidatePath("/finance");
  return {};
}
