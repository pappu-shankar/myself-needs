import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import type { MuscleVolume } from "@/modules/health/engine/types";
import { VolumeLandmarks } from "./volume-landmarks";

const volume: MuscleVolume[] = [
  {
    muscle: "chest",
    hardSets: 14,
    landmark: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 },
    status: "productive",
  },
  {
    muscle: "biceps",
    hardSets: 4.5,
    landmark: { mev: 8, mavLow: 14, mavHigh: 20, mrv: 26 },
    status: "below_mev",
  },
  {
    muscle: "serratus",
    hardSets: 0,
    landmark: { mev: 0, mavLow: 0, mavHigh: 0, mrv: 0 },
    status: "none",
  },
];

describe("VolumeLandmarks", () => {
  it("lists muscles with landmarks or sets, with status text", async () => {
    const { container } = render(<VolumeLandmarks volume={volume} />);
    expect(screen.getAllByTestId("volume-row")).toHaveLength(2);
    expect(screen.getByText("Productive")).toBeTruthy();
    expect(screen.getByText("Below MEV")).toBeTruthy();
    expect(screen.getByText("4.5")).toBeTruthy();
    expectNoAxeViolations(await axe(container));
  });

  it("shows an empty message with nothing trained", () => {
    render(<VolumeLandmarks volume={[]} />);
    expect(screen.getByText(/No sets logged/)).toBeTruthy();
  });
});
