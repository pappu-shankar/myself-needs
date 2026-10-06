import { todayIso } from "@/lib/dates";
import { dismissGymInsight, listDismissedGymInsightIds } from "../insights-store";
import { evaluateGymInsights } from "./rules";
import { buildGymSnapshot } from "./snapshot";
import type { GymInsight } from "./types";

/** Every gym insight that applies today, dismissed ones removed, most severe first. */
export function getGymInsights(today: string = todayIso()): GymInsight[] {
  return evaluateGymInsights(buildGymSnapshot(today), listDismissedGymInsightIds());
}

export { dismissGymInsight };
