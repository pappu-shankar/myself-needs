import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { StatTile } from "./stat-tile";

describe("StatTile accessibility", () => {
  it("has no violations", async () => {
    const { container } = render(
      <div>
        <StatTile label="Online now" value={3} hint="2 live sessions" />
        <StatTile label="Failed logins (24h)" value={12} tone="warning" />
      </div>,
    );
    expectNoAxeViolations(await axe(container));
  });
});
