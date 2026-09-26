import { insertBudget, listBudgetsForMonth, type NewBudget } from "../../db/queries/domain/budgets";

export function createBudget(entry: NewBudget) {
  return insertBudget(entry);
}

/** `month` as "YYYY-MM"; defaults to the current month. */
export function getBudgetsForMonth(month?: string) {
  const monthStart = month ? `${month}-01` : new Date().toISOString().slice(0, 8) + "01";
  const [year, monthNum] = monthStart.split("-").map(Number);
  // monthNum is 1-indexed (e.g. 8 for August); Date.UTC's month param is
  // 0-indexed, so passing it directly lands one month ahead — exactly the
  // "first day of next month" boundary this needs, with year rollover handled
  // for free by Date's normalization (month 12 in December becomes January).
  const monthEnd = new Date(Date.UTC(year, monthNum, 1)).toISOString().slice(0, 10);

  return listBudgetsForMonth(monthStart, monthEnd);
}
