import { and, eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { categories } from "../../schema/domain/categories";
import { transactions } from "../../schema/domain/transactions";
import { budgets } from "../../schema/domain/budgets";
import { recurringRules } from "../../schema/domain/recurring-rules";
import { unarchived, type LifecycleScope } from "../lifecycle";

export type NewCategory = typeof categories.$inferInsert;

/** Categories still in use. An archived one is kept — history references it —
 * but kept out of the pickers. */
export function listCategories(scope: LifecycleScope = {}) {
  const query = getDb().select().from(categories);
  return (scope.includeArchived ? query : query.where(unarchived(categories.archivedAt)))
    .orderBy(categories.name)
    .all();
}

export function listCategoriesByType(type: "income" | "expense", scope: LifecycleScope = {}) {
  return getDb()
    .select()
    .from(categories)
    .where(
      scope.includeArchived
        ? eq(categories.type, type)
        : and(eq(categories.type, type), unarchived(categories.archivedAt)),
    )
    .orderBy(categories.name)
    .all();
}

export function archiveCategory(id: number, archivedAt: string | null) {
  return getDb()
    .update(categories)
    .set({ archivedAt })
    .where(eq(categories.id, id))
    .returning()
    .get();
}

export function getCategoryByIdRow(id: number) {
  return getDb().select().from(categories).where(eq(categories.id, id)).get();
}

export function insertCategory(entry: NewCategory) {
  return getDb().insert(categories).values(entry).returning().get();
}

export function updateCategory(id: number, patch: Partial<Omit<NewCategory, "id">>) {
  return getDb().update(categories).set(patch).where(eq(categories.id, id)).returning().get();
}

/**
 * Whether anything still references this category.
 *
 * Voided transactions count. A void is a correction trail, not a deletion — the
 * voided row still names the category it was filed under, and deleting the
 * category from under it would leave the trail unreadable. Child categories
 * count too: `parent_category_id` is a self-reference, so deleting a parent
 * would orphan its children.
 */
export function categoryHasReferences(id: number): boolean {
  const db = getDb();
  const transaction = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.categoryId, id))
    .get();
  if (transaction) return true;
  const budget = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(eq(budgets.categoryId, id))
    .get();
  if (budget) return true;
  const rule = db
    .select({ id: recurringRules.id })
    .from(recurringRules)
    .where(eq(recurringRules.categoryId, id))
    .get();
  if (rule) return true;
  return (
    db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentCategoryId, id))
      .get() !== undefined
  );
}

/** Only reached for a category nothing references — the service checks first. */
export function deleteCategory(id: number) {
  getDb().delete(categories).where(eq(categories.id, id)).run();
}
