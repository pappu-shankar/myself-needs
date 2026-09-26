import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { categories } from "../../schema/domain/categories";

export type NewCategory = typeof categories.$inferInsert;

export function listCategories() {
  return getDb().select().from(categories).orderBy(categories.name).all();
}

export function listCategoriesByType(type: "income" | "expense") {
  return getDb()
    .select()
    .from(categories)
    .where(eq(categories.type, type))
    .orderBy(categories.name)
    .all();
}

export function insertCategory(entry: NewCategory) {
  return getDb().insert(categories).values(entry).returning().get();
}
