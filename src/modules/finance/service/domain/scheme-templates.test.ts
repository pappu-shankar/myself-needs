import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createSchemeTemplate, getSchemeTemplates } from "./scheme-templates";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("scheme templates service", () => {
  it("seeds the common government scheme templates on first read", () => {
    const templates = getSchemeTemplates();

    expect(templates.length).toBe(8);
    expect(templates.map((t) => t.name)).toContain("PPF (Public Provident Fund)");
    const names = templates.map((t) => t.name);
    expect(names).toEqual([...names].sort());
  });

  it("does not reseed once templates already exist", () => {
    getSchemeTemplates();
    createSchemeTemplate({ name: "Custom Scheme", lockInMonths: 12, interestRate: 6.5 });

    const templates = getSchemeTemplates();

    expect(templates.length).toBe(9);
  });

  it("creates a custom scheme template and returns the persisted row", () => {
    const template = createSchemeTemplate({
      name: "Custom Scheme",
      lockInMonths: 12,
      interestRate: 6.5,
      notes: "Employer plan",
    });

    expect(template).toMatchObject({
      name: "Custom Scheme",
      lockInMonths: 12,
      interestRate: 6.5,
      notes: "Employer plan",
    });
  });
});
