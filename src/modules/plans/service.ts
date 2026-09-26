import {
  countGoals,
  getGoalByIdRow,
  insertGoal,
  listGoals,
  searchGoalsByName,
  updateGoalProgress,
  type NewGoal,
} from "./db/queries";
import type { SearchResult } from "@/types/search";
import type { GoalPriority } from "./types";

const PRIORITY_LABELS: Record<GoalPriority, string> = {
  must_have: "Must have",
  important: "Important",
  aspirational: "Aspirational",
};

export function getGoals() {
  return listGoals();
}

export function getActiveGoalsCount() {
  return countGoals();
}

export function getGoalById(id: number) {
  return getGoalByIdRow(id) ?? null;
}

export function createGoal(entry: NewGoal) {
  return insertGoal(entry);
}

export function setGoalProgress(id: number, progressPercent: number) {
  return updateGoalProgress(id, progressPercent);
}

export function searchPlans(query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return searchGoalsByName(trimmed).map((goal) => ({
    type: "goal",
    id: goal.id,
    label: goal.name,
    subtitle: PRIORITY_LABELS[goal.priority],
    href: "/plans",
  }));
}
