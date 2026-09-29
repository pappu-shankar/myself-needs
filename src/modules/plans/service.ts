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
import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";

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
  if (!entry.name.trim()) throw new DomainError("Goal name is required.");
  if (entry.targetDate) {
    try {
      parseIsoDate(entry.targetDate);
    } catch {
      throw new DomainError("Goal target date must be a valid calendar date.");
    }
  }
  if (
    entry.targetAmount != null &&
    (!Number.isFinite(entry.targetAmount) || entry.targetAmount <= 0)
  ) {
    throw new DomainError("Goal target amount must be greater than zero.");
  }
  if (entry.progressPercent != null && (entry.progressPercent < 0 || entry.progressPercent > 100)) {
    throw new DomainError("Goal progress must be between 0 and 100.");
  }
  return insertGoal(entry);
}

export function setGoalProgress(id: number, progressPercent: number) {
  const goal = getGoalByIdRow(id);
  if (!goal) throw new DomainError("The goal no longer exists.");
  if (goal.type !== "other") {
    throw new DomainError("Financial goal progress is derived from linked investments.");
  }
  if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new DomainError("Goal progress must be between 0 and 100.");
  }
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
