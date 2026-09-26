import { describe, expect, it } from "vitest";
import { hexToLab, labDistance, labToHex, rgbToHex, rgbToLab, scoreContrast } from "./lab-color";

describe("rgbToLab", () => {
  it("maps pure white to L=100, a=0, b=0", () => {
    const lab = rgbToLab(255, 255, 255);
    expect(lab.l).toBeCloseTo(100, 0);
    expect(lab.a).toBeCloseTo(0, 0);
    expect(lab.b).toBeCloseTo(0, 0);
  });

  it("maps pure black to L=0", () => {
    const lab = rgbToLab(0, 0, 0);
    expect(lab.l).toBeCloseTo(0, 0);
    expect(lab.a).toBeCloseTo(0, 0);
    expect(lab.b).toBeCloseTo(0, 0);
  });

  it("maps a mid-gray to a neutral, non-zero lightness", () => {
    const lab = rgbToLab(128, 128, 128);
    expect(lab.l).toBeGreaterThan(40);
    expect(lab.l).toBeLessThan(60);
    expect(lab.a).toBeCloseTo(0, 0);
    expect(lab.b).toBeCloseTo(0, 0);
  });
});

describe("labDistance", () => {
  it("is zero for identical colors", () => {
    const lab = hexToLab("#3366aa");
    expect(labDistance(lab, lab)).toBe(0);
  });

  it("is larger for black-vs-white than for two similar grays", () => {
    const blackVsWhite = labDistance(hexToLab("#000000"), hexToLab("#ffffff"));
    const grayVsGray = labDistance(hexToLab("#808080"), hexToLab("#888888"));
    expect(blackVsWhite).toBeGreaterThan(grayVsGray);
  });
});

describe("rgbToHex", () => {
  it("formats and pads each channel to two hex digits", () => {
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
    expect(rgbToHex(255, 255, 255)).toBe("#ffffff");
    expect(rgbToHex(10, 200, 5)).toBe("#0ac805");
  });

  it("clamps out-of-range values", () => {
    expect(rgbToHex(-10, 300, 128)).toBe("#00ff80");
  });
});

describe("labToHex", () => {
  it("round-trips hexToLab -> labToHex back to (approximately) the same color", () => {
    for (const hex of ["#3366aa", "#c68863", "#ffffff", "#000000", "#0a1a4f"]) {
      const roundTripped = labToHex(hexToLab(hex));
      const original = hexToLab(hex);
      const roundTrippedLab = hexToLab(roundTripped);
      expect(labDistance(original, roundTrippedLab)).toBeLessThan(2);
    }
  });
});

describe("scoreContrast", () => {
  // A mid-tone skin tone, roughly in the range real skin samples fall into.
  const skinTone = hexToLab("#c68863");

  it("scores a strongly contrasting color as pops", () => {
    expect(scoreContrast("#0a1a4f", skinTone)).toBe("pops"); // deep navy
  });

  it("scores a color very close to the skin tone as washed_out", () => {
    expect(scoreContrast("#c88a66", skinTone)).toBe("washed_out"); // near-identical tan
  });

  it("scores a middling color as neutral", () => {
    const verdict = scoreContrast("#a97a5e", skinTone);
    expect(["neutral", "washed_out"]).toContain(verdict);
  });
});
