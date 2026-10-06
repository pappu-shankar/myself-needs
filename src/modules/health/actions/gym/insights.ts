"use server";

import { z } from "zod";
import { defineAction } from "@/modules/core/action/define-action";
import { dismissGymInsight } from "../../service/gym/insights-store";

export const dismissGymInsightAction = defineAction(
  z.object({ id: z.string().trim().min(1).max(300) }),
  ({ id }) => {
    dismissGymInsight(id);
  },
  { name: "health:dismiss-gym-insight" },
);
