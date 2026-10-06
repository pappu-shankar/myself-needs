import { DomainError } from "@/modules/core/errors";
import { todayIso } from "@/lib/dates";
import {
  categoryHasReferences,
  deleteCategory,
  getCategoryByIdRow,
  insertCategory,
  listCategories,
  listCategoriesByType,
  updateCategory,
  type NewCategory,
  archiveCategory,
} from "../../db/queries/domain/categories";

export function getCategories() {
  return listCategories();
}

export function getCategoriesByType(type: "income" | "expense") {
  return listCategoriesByType(type);
}

export function createCategory(entry: NewCategory) {
  validateCategory(entry);
  return insertCategory(entry);
}

export function getCategory(id: number) {
  return getCategoryByIdRow(id) ?? null;
}

/* ── Edit in place, archive, delete (decision 17) ────────────────────────────
 * A category is a descriptive row: a mistyped name is fixed in place, and a
 * category history has filed anything under is archived rather than deleted.
 *
 * `archived_at` arrived in migration 0031 — 0027 had added one to accounts,
 * policies, holdings, rules, entities and goals but missed categories, which
 * left a referenced category with no retire path at all.
 */

/** The rules a category row must satisfy, applied identically on create and on
 * edit so an edit can't produce a row a create would have rejected. */
function validateCategory(entry: {
  name?: string;
  parentCategoryId?: number | null;
  id?: number;
}): void {
  if (entry.name !== undefined && entry.name.trim() === "") {
    throw new DomainError("A category needs a name.");
  }
  // A category that is its own parent makes the tree a cycle, and every walk
  // over it — the budget rollup, the expense breakdown — would not terminate.
  if (entry.id !== undefined && entry.parentCategoryId === entry.id) {
    throw new DomainError("A category can't be its own parent.");
  }
}

export function editCategory(id: number, patch: Partial<Omit<NewCategory, "id">>) {
  const existing = getCategoryByIdRow(id);
  if (!existing) throw new DomainError("That category no longer exists.");

  const parentCategoryId =
    patch.parentCategoryId === undefined ? existing.parentCategoryId : patch.parentCategoryId;
  validateCategory({ name: patch.name ?? existing.name, parentCategoryId, id });

  // Changing `type` is allowed only while nothing is filed under the category:
  // an expense category re-typed as income would flip the sign of every
  // historical transaction in every report built on it, which is the same class
  // of silent restatement that makes ledger rows immutable.
  if (patch.type !== undefined && patch.type !== existing.type && categoryHasReferences(id)) {
    throw new DomainError(
      "This category is already used by transactions, budgets or recurring rules, so it can't " +
        "be switched between income and expense. Create a new category of the right type instead.",
    );
  }

  return updateCategory(id, patch);
}

/**
 * Hard-deletes a category, and **refuses** when anything references it.
 *
 * A transaction pointing at a deleted category loses what the money was for,
 * and a budget loses what it was limiting — neither is recoverable, so the
 * delete is refused rather than cascading.
 */
export function deleteCategoryById(id: number) {
  if (!getCategoryByIdRow(id)) throw new DomainError("That category no longer exists.");
  if (categoryHasReferences(id)) {
    throw new DomainError(
      "This category is used by transactions, budgets, recurring rules or sub-categories, so " +
        "it can't be deleted. Rename it instead — every record filed under it stays intact.",
    );
  }
  deleteCategory(id);
}

/**
 * Retires a category without touching anything filed under it.
 *
 * This is the answer to a delete that is refused: the records keep saying what
 * they were for, and the category stops appearing in pickers so nothing new can
 * be filed under it.
 */
export function archiveCategoryById(id: number) {
  if (!getCategoryByIdRow(id)) throw new DomainError("That category no longer exists.");
  return archiveCategory(id, todayIso());
}

export function unarchiveCategoryById(id: number) {
  if (!getCategoryByIdRow(id)) throw new DomainError("That category no longer exists.");
  return archiveCategory(id, null);
}
