import {
  getProjectByIdRow,
  insertProject,
  listProjects,
  updateProjectRow,
  type NewProject,
} from "../db/queries/projects";

export function getProjects() {
  return listProjects();
}

export function getProject(id: number) {
  return getProjectByIdRow(id) ?? null;
}

export function createProject(entry: NewProject) {
  return insertProject(entry);
}

export function updateProject(id: number, entry: Partial<NewProject>) {
  return updateProjectRow(id, entry);
}
