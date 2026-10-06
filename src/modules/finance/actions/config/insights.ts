"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { setInsightsSettings } from "../../service/config/insights-settings";

const settingsSchema = z.object({
  creditUtilizationThresholdPercent: z.coerce.number().min(0).max(100),
  idleCashMonthsMultiple: z.coerce.number().min(0),
  staleValuationDays: z.coerce.number().int().min(0),
  recurringPileupThreshold: z.coerce.number().int().min(1),
  budgetHeadroomPercent: z.coerce.number().min(0).max(100),
  ltcgApproachingPercent: z.coerce.number().min(0).max(100),
});

export interface UpdateInsightsSettingsState {
  error?: string;
}

export const updateInsightsSettingsAction = defineFormAction(
  async (
    _prevState: UpdateInsightsSettingsState,
    formData: FormData,
  ): Promise<UpdateInsightsSettingsState> => {
    const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
    }

    setInsightsSettings(parsed.data);
    // Thresholds feed the insight rules themselves, so the list on /finance/insights
    // needs refreshing too, not just this settings page.
    revalidatePath("/finance/insights");
    revalidatePath("/finance/settings");
    return {};
  },
);
