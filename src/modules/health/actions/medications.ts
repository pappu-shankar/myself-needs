"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { createMedication, logMedicationDose } from "../service/medications";

const medicationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

export interface AddMedicationState {
  error?: string;
}

export async function addMedicationAction(
  _prevState: AddMedicationState,
  formData: FormData,
): Promise<AddMedicationState> {
  await requireUnlocked();
  const parsed = medicationSchema.safeParse({
    name: formData.get("name"),
    dosage: formData.get("dosage") || undefined,
    frequency: formData.get("frequency") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid medication" };
  }

  createMedication({
    name: parsed.data.name,
    dosage: parsed.data.dosage ?? null,
    frequency: parsed.data.frequency ?? null,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/health");
  return {};
}

const logDoseSchema = z.object({
  medicationId: z.coerce.number().int(),
  date: z.string().min(1),
});

export interface LogDoseState {
  error?: string;
}

export async function logDoseAction(
  _prevState: LogDoseState,
  formData: FormData,
): Promise<LogDoseState> {
  await requireUnlocked();
  const parsed = logDoseSchema.safeParse({
    medicationId: formData.get("medicationId"),
    date: formData.get("date"),
  });

  if (!parsed.success) {
    return { error: "Invalid dose log" };
  }

  logMedicationDose(parsed.data.medicationId, parsed.data.date);
  revalidatePath("/health");
  return {};
}
