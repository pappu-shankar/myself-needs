"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { withUser } from "@/modules/core/session/guard";
import {
  setAllocationTarget,
  setDateOfBirth,
  dismissGettingStartedChecklist,
} from "../../service/config/allocation";

const dobSchema = z.object({
  dateOfBirth: z.string().optional(),
});

export interface SetDateOfBirthState {
  error?: string;
}

export const setDateOfBirthAction = defineFormAction(
  async (_prevState: SetDateOfBirthState, formData: FormData): Promise<SetDateOfBirthState> => {
    const parsed = dobSchema.safeParse({ dateOfBirth: formData.get("dateOfBirth") || undefined });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid date of birth" };
    }

    setDateOfBirth(parsed.data.dateOfBirth ?? null);
    revalidatePath("/finance/settings");
    return {};
  },
);

const targetSchema = z.object({
  assetClass: z.enum(["equity", "debt", "gold", "cash"]),
  targetPercentage: z.coerce.number().min(0).max(100),
});

export interface SetAllocationTargetState {
  error?: string;
}

export const setAllocationTargetAction = defineFormAction(
  async (
    _prevState: SetAllocationTargetState,
    formData: FormData,
  ): Promise<SetAllocationTargetState> => {
    const parsed = targetSchema.safeParse({
      assetClass: formData.get("assetClass"),
      targetPercentage: formData.get("targetPercentage"),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid target" };
    }

    setAllocationTarget(parsed.data.assetClass, parsed.data.targetPercentage);
    revalidatePath("/finance/settings");
    return {};
  },
);

/** No form fields — a single "skip" button on the finance hub's getting-started checklist. */
/** A plain `<form action>` (no state), so it can't use defineFormAction; a
 * space viewer's click is ignored rather than refused. */
export async function dismissGettingStartedAction() {
  await withUser((scope) => {
    if (scope.spaceRole === "viewer") return;
    dismissGettingStartedChecklist();
    revalidatePath("/finance");
  });
}
