import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { projects } from "../schema/projects";

export type NewProject = typeof projects.$inferInsert;

export function listProjects() {
  return getDb().select().from(projects).orderBy(projects.name).all();
}

export function getProjectByIdRow(id: number) {
  return getDb().select().from(projects).where(eq(projects.id, id)).get();
}

export function insertProject(entry: NewProject) {
  return getDb().insert(projects).values(entry).returning().get();
}

export function updateProjectRow(id: number, entry: Partial<NewProject>) {
  return getDb().update(projects).set(entry).where(eq(projects.id, id)).returning().get();
}
