import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { CompositionCards } from "./composition-cards";

const full = {
  bmi: 24.2,
  bodyFatPct: 16.5,
  bodyFatSource: "navy" as const,
  leanMassKg: 66.8,
  ffmi: 20.6,
  normalizedFfmi: 20.6,
  waistToHeight: 0.46,
};
const empty = {
  bmi: null,
  bodyFatPct: null,
  bodyFatSource: null,
  leanMassKg: null,
  ffmi: null,
  normalizedFfmi: null,
  waistToHeight: null,
};

describe("CompositionCards", () => {
  it("shows values, categories and the Navy caveat", async () => {
    const { container } = render(<CompositionCards composition={full} sex="male" heightCm={180} />);
    expect(screen.getByText("24.2")).toBeTruthy();
    expect(screen.getByText(/Normal range/)).toBeTruthy();
    expect(screen.getByText(/±3–4 percentage points/)).toBeTruthy();
    expect(screen.getByText("0.46")).toBeTruthy();
    expectNoAxeViolations(await axe(container));
  });

  it("explains what to add when inputs are missing", async () => {
    const { container } = render(
      <CompositionCards composition={empty} sex={null} heightCm={null} />,
    );
    expect(screen.getByText(/Add your height and log your weight/)).toBeTruthy();
    expect(screen.getByText(/Set your sex and height/)).toBeTruthy();
    expectNoAxeViolations(await axe(container));
  });
});
