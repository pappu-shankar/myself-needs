import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { MUSCLES } from "@/modules/health/types";
import { BODY_MAP } from "./body-map-paths";
import { BodyMap, MuscleChips } from "./body-map";

describe("BODY_MAP", () => {
  it.each(["male", "female"] as const)("covers all 18 muscles for the %s figure", (sex) => {
    const present = new Set(
      [...BODY_MAP[sex].front.parts, ...BODY_MAP[sex].back.parts]
        .map((p) => p.muscle)
        .filter(Boolean),
    );
    for (const m of MUSCLES) expect(present.has(m), m).toBe(true);
  });

  it("drops sub-group overlays", () => {
    const slugs = Object.values(BODY_MAP.male.front.parts).map((p) => p.slug);
    expect(slugs).not.toContain("upper-chest");
    expect(slugs).not.toContain("inner-quad");
  });
});

describe("BodyMap", () => {
  const props = {
    title: "Weekly muscle load",
    levels: { chest: 4, biceps: 2 } as const,
    values: { chest: 12.5, biceps: 6 },
    valueLabel: "sets",
  };

  it("renders front and back views with levels applied", () => {
    const { container } = render(<BodyMap {...props} />);
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(container.querySelector('[data-muscle="chest"]')?.getAttribute("data-level")).toBe("4");
    expect(container.querySelector('[data-muscle="quadriceps"]')?.getAttribute("data-level")).toBe(
      "0",
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Chest 12.5 sets");
    expect(container.querySelector("title")?.textContent).toMatch(/ — /);
  });

  it("shows a readout on hover", () => {
    const { container } = render(<BodyMap {...props} />);
    fireEvent.mouseEnter(container.querySelector('[data-muscle="chest"]')!);
    expect(container.querySelector("[aria-live]")?.textContent).toBe("Chest — 12.5 sets");
  });

  it("toggles to a table", () => {
    render(<BodyMap {...props} figure="female" />);
    fireEvent.click(screen.getByRole("button", { name: "View as table" }));
    expect(screen.getAllByRole("row")).toHaveLength(19);
    expect(screen.getByText("12.5")).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = render(<BodyMap {...props} />);
    expectNoAxeViolations(await axe(container));
  });

  it("MuscleChips lists labels", () => {
    render(<MuscleChips muscles={["chest", "lower-back"]} label="Untrained:" />);
    expect(screen.getByText("Lower back")).toBeTruthy();
  });
});
