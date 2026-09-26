import { describe, expect, it } from "vitest";
import { removeSolidBackground } from "./background-removal";

const WIDTH = 10;
const HEIGHT = 10;

function makeSolidBackgroundWithSquare(
  bg: [number, number, number],
  fg: [number, number, number],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      // A 4x4 "garment" square in the middle, everything else background.
      const isForeground = x >= 3 && x < 7 && y >= 3 && y < 7;
      const [r, g, b] = isForeground ? fg : bg;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

describe("removeSolidBackground", () => {
  it("makes the plain background transparent and keeps the foreground square opaque", () => {
    const pixels = makeSolidBackgroundWithSquare([240, 240, 240], [30, 60, 200]);

    const result = removeSolidBackground(pixels, WIDTH, HEIGHT);

    // A background corner is now transparent.
    expect(result[(0 * WIDTH + 0) * 4 + 3]).toBe(0);
    // The center of the foreground square is still opaque, with its
    // original color untouched.
    const centerIndex = (5 * WIDTH + 5) * 4;
    expect(result[centerIndex + 3]).toBe(255);
    expect(result[centerIndex]).toBe(30);
    expect(result[centerIndex + 1]).toBe(60);
    expect(result[centerIndex + 2]).toBe(200);
  });

  it("tolerates a gradual gradient in the background without breaking the fill", () => {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = (y * WIDTH + x) * 4;
        const isForeground = x >= 3 && x < 7 && y >= 3 && y < 7;
        if (isForeground) {
          pixels[i] = 30;
          pixels[i + 1] = 60;
          pixels[i + 2] = 200;
        } else {
          // Background drifts smoothly from 200 to 240 across the width —
          // small enough per-pixel steps to stay under the tolerance.
          const shade = 200 + Math.round((x / WIDTH) * 40);
          pixels[i] = shade;
          pixels[i + 1] = shade;
          pixels[i + 2] = shade;
        }
        pixels[i + 3] = 255;
      }
    }

    const result = removeSolidBackground(pixels, WIDTH, HEIGHT);

    // Both the near corner and the far (lighter-shaded) corner of the
    // gradient background should still be removed.
    expect(result[(0 * WIDTH + 0) * 4 + 3]).toBe(0);
    expect(result[(0 * WIDTH + (WIDTH - 1)) * 4 + 3]).toBe(0);
  });

  it("stops at a sharp color edge (the garment silhouette)", () => {
    const pixels = makeSolidBackgroundWithSquare([240, 240, 240], [10, 10, 10]);

    const result = removeSolidBackground(pixels, WIDTH, HEIGHT, 32);

    // Even directly adjacent to the background, the foreground square's
    // edge pixel should not be marked transparent.
    const edgeIndex = (3 * WIDTH + 3) * 4;
    expect(result[edgeIndex + 3]).toBe(255);
  });
});
