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
  /** Integer amount in `currency`'s minor units, only meaningful for
   * `type: "financial"`. Never rupees as a float — see
   * docs/architecture/data-model.md. */
  targetAmountMinor: number | null;
  /** The currency `targetAmountMinor` is denominated in; a minor amount can't
   * be formatted or compared without it. */
  currency: string;
  progressPercent: number | null;
  note: string | null;
  createdAt: string;
}
