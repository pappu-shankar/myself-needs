import { describe, expect, it } from "vitest";
import { activeNavHref, moduleOfPath, navItems, visibleNavItems } from "./nav-config";

describe("activeNavHref", () => {
  it("picks the most specific matching item", () => {
    expect(activeNavHref("/health")).toBe("/health");
    expect(activeNavHref("/health/gym")).toBe("/health/gym");
    expect(activeNavHref("/health/gym/library/12")).toBe("/health/gym");
    expect(activeNavHref("/finance/tax")).toBe("/finance");
  });

  it("doesn't match a mere prefix of a segment", () => {
    expect(activeNavHref("/healthy")).toBeUndefined();
  });
});

describe("visibleNavItems", () => {
  it("shows everything in the personal vault", () => {
    expect(visibleNavItems(null).map((i) => i.href)).toEqual(navItems.map((i) => i.href));
  });

  it("hides modules a space hasn't enabled, keeping Dashboard and Settings", () => {
    expect(visibleNavItems(["finance", "house"]).map((i) => i.href)).toEqual([
      "/dashboard",
      "/finance",
      "/house",
      "/settings",
    ]);
  });
});

describe("moduleOfPath", () => {
  it("maps a path to its space module", () => {
    expect(moduleOfPath("/health/gym/library")).toBe("health");
    expect(moduleOfPath("/finance")).toBe("finance");
    expect(moduleOfPath("/settings/devices")).toBeUndefined();
    expect(moduleOfPath("/dashboard")).toBeUndefined();
  });
});
