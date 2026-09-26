/** Public surface — the only thing other modules/app routes may import from `plans`. */
export {
  getGoals,
  getActiveGoalsCount,
  getGoalById,
  createGoal,
  setGoalProgress,
  searchPlans,
} from "./service";
export {
  addGoalAction,
  type AddGoalState,
  updateGoalProgressAction,
  type UpdateGoalProgressState,
} from "./actions";
export type { Goal } from "./types";
export { GOAL_TYPES, GOAL_PRIORITIES, type GoalType, type GoalPriority } from "./types";
