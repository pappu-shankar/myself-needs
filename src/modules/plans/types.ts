export const GOAL_TYPES = ["financial", "other"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_PRIORITIES = ["must_have", "important", "aspirational"] as const;
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];

export interface Goal {
  id: number;
  name: string;
  type: GoalType;
  priority: GoalPriority;
  targetDate: string | null;
  targetAmount: number | null;
  progressPercent: number | null;
  note: string | null;
  createdAt: string;
}
