import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  FINANCE_BUILT_PAGES,
  FINANCE_PAGES,
  FINANCE_SECTIONS,
  FINANCE_SEGMENT_LABELS,
  pageOfPath,
  sectionOfPath,
} from "./ia-config";

/**
 * The IA config replaced five hand-synced copies of the same structure, which
 * had drifted. These tests are what stops it drifting again — in particular the
 * route-existence check, which is the failure the old arrangement produced most
 * often: a card or a nav item pointing at a page nobody built.
 */
describe("finance IA config", () => {
  it("lists every section the PRD defines, in order", () => {
    expect(FINANCE_SECTIONS.map((s) => s.id)).toEqual([
      "money",
      "wealth",
      "debt",
      "goals",
      "tax",
      "intelligence",
    ]);
  });

  it("points every built page at a route that exists", () => {
    const appDir = path.join(process.cwd(), "src", "app", "(protected)");
    for (const page of FINANCE_BUILT_PAGES) {
      const dir = path.join(appDir, page.href.replace(/^\//, ""));
      expect(
        existsSync(path.join(dir, "page.tsx")),
        `${page.href} is in the IA config but has no page.tsx`,
      ).toBe(true);
    }
  });

  it("marks a page planned only when its route does not exist yet", () => {
    // A `planned` page that has actually been built is a nav item left greyed
    // out after the work landed — invisible to the person who built it.
    const appDir = path.join(process.cwd(), "src", "app", "(protected)");
    for (const page of FINANCE_PAGES.filter((p) => p.planned)) {
      const dir = path.join(appDir, page.href.replace(/^\//, ""));
      expect(
        existsSync(path.join(dir, "page.tsx")),
        `${page.href} is marked planned but the route exists — drop the flag`,
      ).toBe(false);
    }
  });

  it("gives every page a distinct route and a distinct breadcrumb segment", () => {
    const hrefs = FINANCE_PAGES.map((p) => p.href);
    expect(new Set(hrefs).size, "two pages share a route").toBe(hrefs.length);
    const segments = hrefs.map((h) => h.split("/").pop());
    expect(new Set(segments).size, "two pages share a last segment").toBe(segments.length);
  });

  it("derives a breadcrumb label for every page, matching its nav title", () => {
    for (const page of FINANCE_PAGES) {
      expect(FINANCE_SEGMENT_LABELS[page.href.split("/").pop()!]).toBe(page.title);
    }
  });

  it("resolves a nested route to its own page, not to a shorter prefix", () => {
    expect(pageOfPath("/finance/investments/holdings")?.href).toBe("/finance/investments");
    expect(sectionOfPath("/finance/investments/holdings")?.id).toBe("wealth");
    expect(sectionOfPath("/finance/tax/capital-gains")?.id).toBe("tax");
    expect(sectionOfPath("/finance/accounts")?.id).toBe("money");
  });

  it("resolves nothing for the hub itself or an unknown route", () => {
    expect(sectionOfPath("/finance")).toBeUndefined();
    expect(sectionOfPath("/finance/not-a-page")).toBeUndefined();
    // And not on a mere prefix of a segment.
    expect(sectionOfPath("/finance/accountsomething")).toBeUndefined();
  });

  it("gives every section at least one page", () => {
    for (const section of FINANCE_SECTIONS) {
      expect(section.pages.length, `${section.id} has no pages`).toBeGreaterThan(0);
    }
  });
});
