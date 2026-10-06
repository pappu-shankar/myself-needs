import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { repMaxTable } from "@/modules/health/engine/e1rm";
import { RepMaxTable } from "./rep-max-table";

describe("RepMaxTable", () => {
  const rows = repMaxTable(116.7, "epley");

  it("lists every rep max with a percentage of the 1RM", () => {
    render(<RepMaxTable rows={rows} caption="Rep maxes (Epley)" />);
    expect(screen.getAllByRole("row")).toHaveLength(rows.length + 1);
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Rep maxes (Epley)" })).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<RepMaxTable rows={rows} caption="Rep maxes (Epley)" />);
    expectNoAxeViolations(await axe(container));
  });
});
