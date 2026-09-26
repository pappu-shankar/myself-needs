import { count } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { schemeTemplates } from "../../schema/domain/scheme-templates";

export type NewSchemeTemplate = typeof schemeTemplates.$inferInsert;

/** Common Indian government schemes — rates as of this app's initial build; editable per-row since they get revised. */
const SEED_TEMPLATES: NewSchemeTemplate[] = [
  { name: "PPF (Public Provident Fund)", lockInMonths: 180, interestRate: 7.1 },
  { name: "EPF (Employees' Provident Fund)", lockInMonths: null, interestRate: 8.25 },
  { name: "NSC (National Savings Certificate)", lockInMonths: 60, interestRate: 7.7 },
  { name: "SSY (Sukanya Samriddhi Yojana)", lockInMonths: 252, interestRate: 8.2 },
  { name: "SCSS (Senior Citizens Savings Scheme)", lockInMonths: 60, interestRate: 8.2 },
  { name: "KVP (Kisan Vikas Patra)", lockInMonths: 115, interestRate: 7.5 },
  { name: "Post Office Time Deposit", lockInMonths: 60, interestRate: 7.5 },
  { name: "Post Office Recurring Deposit", lockInMonths: 60, interestRate: 6.7 },
];

function seedIfEmpty() {
  const existing = getDb().select({ value: count() }).from(schemeTemplates).get()?.value ?? 0;
  if (existing === 0) {
    getDb().insert(schemeTemplates).values(SEED_TEMPLATES).run();
  }
}

export function listSchemeTemplates() {
  seedIfEmpty();
  return getDb().select().from(schemeTemplates).orderBy(schemeTemplates.name).all();
}

export function insertSchemeTemplate(entry: NewSchemeTemplate) {
  return getDb().insert(schemeTemplates).values(entry).returning().get();
}
