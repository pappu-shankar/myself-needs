import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { GymStats } from "@/modules/health";
import { MuscleMapCard } from "./muscle-map-card";

const all: GymStats["muscles"] = {
  levels: { chest: 3 },
  load: { chest: 6 },
  missed: ["quads"],
} as unknown as GymStats["muscles"];
const none: GymStats["hardMuscles"] = {
  levels: {},
  load: {},
  missed: ["chest", "quads"],
} as unknown as GymStats["hardMuscles"];

describe("MuscleMapCard", () => {
  it("switches to hard sets and explains when none are rated", () => {
    render(<MuscleMapCard muscles={all} hardMuscles={none} figure="male" />);
    expect(screen.getByText("Not trained in this period:")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Hard sets only" }));
    expect(screen.getByText("No hard sets in this period:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "gym settings" })).toHaveAttribute(
      "href",
      "/health/gym/settings",
    );
  });
});
