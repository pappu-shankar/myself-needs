import { describe, expect, it } from "vitest";
import {
  capitalize,
  libraryHref,
  pageRange,
  parseLibraryParams,
  type LibraryFilters,
} from "./library-params";

describe("parseLibraryParams", () => {
  it("defaults to no filters", () => {
    expect(parseLibraryParams({})).toEqual({
      q: "",
      bodyPart: "",
      equipment: "",
      muscle: null,
      favorites: false,
      owned: false,
      archived: false,
      page: 1,
    });
  });

  it("reads and normalises values, taking the first of repeated params", () => {
    const f = parseLibraryParams({
      q: ["  bench ", "x"],
      bodyPart: "Chest",
      equipment: "Barbell",
      muscle: "chest",
      favorites: "1",
      owned: "on",
      archived: "true",
      page: "3",
    });
    expect(f).toMatchObject({
      q: "bench",
      bodyPart: "chest",
      equipment: "barbell",
      muscle: "chest",
      favorites: true,
      owned: true,
      archived: true,
      page: 3,
    });
  });

  it("ignores junk", () => {
    const f = parseLibraryParams({ muscle: "pecs", page: "-4", favorites: "no" });
    expect(f.muscle).toBeNull();
    expect(f.page).toBe(1);
    expect(f.favorites).toBe(false);
    expect(parseLibraryParams({ page: "abc" }).page).toBe(1);
    expect(parseLibraryParams({ page: "999999999" }).page).toBe(10_000);
  });
});

describe("libraryHref", () => {
  const base: LibraryFilters = parseLibraryParams({});
  it("omits defaults", () => {
    expect(libraryHref(base)).toBe("/health/gym/library");
  });
  it("applies overrides and encodes", () => {
    expect(libraryHref({ ...base, q: "a b" }, { page: 2, favorites: true })).toBe(
      "/health/gym/library?q=a+b&favorites=1&page=2",
    );
  });
});

describe("helpers", () => {
  it("capitalizes", () => {
    expect(capitalize("upper arms")).toBe("Upper arms");
    expect(capitalize("")).toBe("");
  });
  it("computes page ranges", () => {
    expect(pageRange(1, 50, 0)).toEqual({ from: 0, to: 0, pages: 1 });
    expect(pageRange(2, 50, 120)).toEqual({ from: 51, to: 100, pages: 3 });
    expect(pageRange(3, 50, 120)).toEqual({ from: 101, to: 120, pages: 3 });
  });
});
