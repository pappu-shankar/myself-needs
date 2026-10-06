import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OneRmCalculator } from "./one-rm-calculator";

describe("OneRmCalculator", () => {
  it("estimates a 1RM and shows the rep-max table", () => {
    render(<OneRmCalculator formula="epley" />);
    fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "5" } });
    expect(screen.getByText(/Estimated 1RM/).textContent).toContain("116.7 kg");
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("works in pounds", () => {
    render(<OneRmCalculator formula="epley" weightUnit="lb" />);
    fireEvent.change(screen.getByLabelText("Weight (lb)"), { target: { value: "225" } });
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "5" } });
    expect(screen.getByText(/Estimated 1RM/).textContent).toContain("262.6 lb");
  });

  it("refuses more than the rep cap", () => {
    render(<OneRmCalculator formula="epley" />);
    fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "20" } });
    expect(screen.getByText(/unreliable/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
