"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { createMetric } from "../service/metrics";
import { HEALTH_METRIC_TYPES, DEFAULT_UNITS } from "../types";

const metricSchema = z.object({
  type: z.enum(HEALTH_METRIC_TYPES),
  date: z.string().min(1, "Date is required"),
  label: z.string().optional(),
  value: z.coerce.number().optional(),
  note: z.string().optional(),
});

const TYPE_LABELS: Record<(typeof HEALTH_METRIC_TYPES)[number], string> = {
  weight: "Weight",
  sleep_hours: "Sleep",
  exercise_minutes: "Exercise",
  custom: "Custom",
};

export interface AddMetricState {
  error?: string;
}

export const addMetricAction = defineFormAction(
  async (_prevState: AddMetricState, formData: FormData): Promise<AddMetricState> => {
    const parsed = metricSchema.safeParse({
      type: formData.get("type"),
      date: formData.get("date"),
      label: formData.get("label") || undefined,
      value: formData.get("value") || undefined,
      note: formData.get("note") || undefined,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid entry" };
    }

    const label =
      parsed.data.type === "custom"
        ? (parsed.data.label ?? "Custom")
        : TYPE_LABELS[parsed.data.type];

    createMetric({
      type: parsed.data.type,
      date: parsed.data.date,
      label,
      value: parsed.data.value ?? null,
      unit: DEFAULT_UNITS[parsed.data.type] || null,
      note: parsed.data.note ?? null,
    });

    revalidatePath("/health");
    revalidatePath("/dashboard");
    return {};
  },
);
