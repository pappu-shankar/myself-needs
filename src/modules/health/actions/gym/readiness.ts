"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zIsoDate, zOptionalText } from "@/lib/validation";
import { upsertReadinessCheckin } from "../../service/gym/readiness";

const zRating = z.coerce
  .number({ error: "Pick 1–5" })
  .int({ error: "Pick 1–5" })
  .min(1, { error: "Pick 1–5" })
  .max(5, { error: "Pick 1–5" });

export type UpsertReadinessCheckinState = ActionState;

/**
 * Form fields: `date`, `sleepQuality`, `energy`, `soreness`, `stress`,
 * `motivation` (each 1–5; soreness and stress 5 = worst), optional `note`.
 */
export const upsertReadinessCheckinAction = defineFormAction(
  z.object({
    date: zIsoDate,
    sleepQuality: zRating,
    energy: zRating,
    soreness: zRating,
    stress: zRating,
    motivation: zRating,
    note: zOptionalText(500),
  }),
  ({ date, ...checkin }) => {
    upsertReadinessCheckin(date, checkin);
  },
  { name: "health:upsert-readiness-checkin" },
);
