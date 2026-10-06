import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import catalog from "../../data/exercise-catalog.json";
import { getRoutine, listRoutines } from "./routines";
import { getWeekSchedule, setWeekdayRoutine } from "./schedule";
import { applyTemplate, listTemplates, templateCatalogKeys, TEMPLATE_KEYS } from "./templates";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("starter templates", () => {
  it("only use exercise keys that exist in the bundled catalog", () => {
    const keys = new Set(catalog.exercises.map((e) => e.key));
    const missing = templateCatalogKeys().filter((key) => !keys.has(key));
    expect(missing).toEqual([]);
  });

  it("lists every template with its days and exercise names", () => {
    const templates = listTemplates();
    expect(templates.map((t) => t.key)).toEqual(TEMPLATE_KEYS);
    expect(TEMPLATE_KEYS).toEqual(
      expect.arrayContaining([
        "ppl",
        "upper_lower",
        "full_body",
        "five_by_five",
        "greyskull",
        "wendler_bbb",
      ]),
    );
    const ppl = templates.find((t) => t.key === "ppl")!;
    expect(ppl.days.map((d) => d.name)).toEqual(["Push", "Pull", "Legs"]);
    expect(ppl.days[0].exercises[0]).toBe("Barbell Bench Press");
    expect(templates.find((t) => t.key === "upper_lower")!.days).toHaveLength(4);
    expect(templates.find((t) => t.key === "wendler_bbb")!.days).toHaveLength(4);
  });

  it("builds every template into valid routines", () => {
    for (const key of TEMPLATE_KEYS) {
      const { routineIds } = applyTemplate(key, { assignWeek: false });
      expect(routineIds.length).toBeGreaterThan(1);
      for (const id of routineIds) expect(getRoutine(id).entries.length).toBeGreaterThan(0);
    }
  });

  it("applies 5/3/1 BBB with its schemes and plans the week", () => {
    setWeekdayRoutine(0, applyTemplate("ppl", { assignWeek: false }).routineIds[0]);
    const { routineIds } = applyTemplate("wendler_bbb", { assignWeek: true });
    const press = getRoutine(routineIds[0]);
    expect(press.name).toBe("5/3/1 BBB — Press");
    expect(press.progressionPolicy).toBe("off");
    expect(press.entries.map((e) => e.scheme)).toEqual(["wendler_main", "wendler_bbb", "standard"]);
    expect(press.entries[0].exercise.id).toBe(press.entries[1].exercise.id);
    expect(press.entries[2]).toMatchObject({ progressionPolicy: "double", repsMin: 6, reps: 10 });

    // The week is replaced: Sunday's old routine is gone.
    expect(getWeekSchedule().map((d) => d.routineId)).toEqual([
      null,
      routineIds[0],
      routineIds[1],
      null,
      routineIds[2],
      routineIds[3],
      null,
    ]);
  });

  it("keeps names distinct when applied twice and uses the template's policy", () => {
    applyTemplate("greyskull", { assignWeek: false });
    const { routineIds } = applyTemplate("greyskull", { assignWeek: false });
    expect(getRoutine(routineIds[0])).toMatchObject({
      name: "Greyskull LP — A (2)",
      progressionPolicy: "greyskull",
    });
    expect(listRoutines()).toHaveLength(4);
  });

  it("plans an A/B template on alternating days", () => {
    const { routineIds } = applyTemplate("five_by_five", { assignWeek: true });
    const week = getWeekSchedule().map((d) => d.routineId);
    expect([week[1], week[3], week[5]]).toEqual([routineIds[0], routineIds[1], routineIds[0]]);
  });

  it("rejects an unknown template", () => {
    expect(() => applyTemplate("nope", { assignWeek: false })).toThrow("doesn't exist");
  });
});
