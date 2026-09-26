import {
  insertCategory,
  listCategories,
  listCategoriesByType,
  type NewCategory,
} from "../../db/queries/domain/categories";

export function getCategories() {
  return listCategories();
}

export function getCategoriesByType(type: "income" | "expense") {
  return listCategoriesByType(type);
}

export function createCategory(entry: NewCategory) {
  return insertCategory(entry);
}
