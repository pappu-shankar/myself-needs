import { customType } from "drizzle-orm/sqlite-core";

/**
 * Ledger money: stored as INTEGER paise so SQL sums are exact (a REAL column
 * turned 0.30 − 0.10 − 0.20 into −2.8e-17 and fired a "negative balance"
 * insight). Application code reads and writes rupees; the conversion happens
 * here, at the column boundary.
 *
 * Raw `sql` expressions over a money column see paise — map their result back
 * with `.mapWith(paiseToRupees)`.
 */
export const money = customType<{ data: number; driverData: number }>({
  dataType: () => "integer",
  toDriver: (rupees) => rupeesToPaise(rupees),
  fromDriver: (paise) => paiseToRupees(paise),
});

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: unknown): number {
  return Number(paise ?? 0) / 100;
}
