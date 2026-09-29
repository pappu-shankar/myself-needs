import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createProject, updateProject } from "./projects";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("house mutation services", () => {
  it("rejects updates for a missing entity", () => {
    expect(() => updateProject(999, { name: "Renamed" })).toThrow("no longer exists");
  });

  it("returns the updated entity", () => {
    const project = createProject({ name: "Home" });

    expect(updateProject(project.id, { name: "New home" })).toMatchObject({
      id: project.id,
      name: "New home",
    });
  });
});
