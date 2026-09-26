import { describe, expect, it } from "vitest";
import { resizeMask } from "./mask-resize";

describe("resizeMask", () => {
  it("returns the same array unchanged when dimensions already match", () => {
    const mask = new Uint8Array([1, 0, 1, 0]);
    expect(resizeMask(mask, 2, 2, 2, 2)).toBe(mask);
  });

  it("upscales a small mask, preserving which quadrant was set", () => {
    // 2x2 mask: top-left=1, everything else 0.
    const mask = new Uint8Array([1, 0, 0, 0]);

    const resized = resizeMask(mask, 2, 2, 4, 4);

    expect(resized.length).toBe(16);
    // Top-left quadrant of the 4x4 output should be 1.
    expect(resized[0]).toBe(1);
    expect(resized[1]).toBe(1);
    expect(resized[4]).toBe(1);
    // Bottom-right quadrant should still be 0.
    expect(resized[15]).toBe(0);
  });

  it("downscales without throwing and keeps output at the target size", () => {
    const mask = new Uint8Array(16).fill(1);
    const resized = resizeMask(mask, 4, 4, 2, 2);
    expect(resized.length).toBe(4);
    expect(Array.from(resized)).toEqual([1, 1, 1, 1]);
  });
});
