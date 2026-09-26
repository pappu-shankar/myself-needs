interface Rgb {
  r: number;
  g: number;
  b: number;
}

function pixelRgbAt(pixels: Uint8ClampedArray, width: number, x: number, y: number): Rgb {
  const i = (y * width + x) * 4;
  return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

const DEFAULT_COLOR_TOLERANCE = 32;

/**
 * Removes a plain/solid background from a garment product photo via
 * flood-fill from the four corners — assumes the garment was photographed
 * against an even, unpatterned surface (a bed, wall, table), per this
 * module's upload guidance; not reliable against a busy/patterned
 * background. Each step compares a pixel to its immediate flood-fill
 * neighbor's actual color (not a single fixed seed color), so a gradual
 * lighting gradient across the background doesn't stop the fill early,
 * while a sharp edge (the garment's silhouette) still does. Sets alpha to
 * 0 for every matched (background) pixel. Pure: takes/returns a plain RGBA
 * byte array, no Canvas/DOM dependency. See docs/prd/fashion.md.
 */
export function removeSolidBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  colorTolerance: number = DEFAULT_COLOR_TOLERANCE,
): Uint8ClampedArray<ArrayBuffer> {
  // Allocated by length (not copy-constructed from `pixels`) so the result
  // is a plain ArrayBuffer-backed Uint8ClampedArray — see the same note in
  // recolor-canvas.ts's applyHueShift().
  const result = new Uint8ClampedArray(pixels.length);
  result.set(pixels);

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const corners: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  for (const [cx, cy] of corners) {
    const seedIndex = cy * width + cx;
    if (visited[seedIndex]) continue;
    visited[seedIndex] = 1;
    stack.push(seedIndex);
  }

  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = Math.floor(index / width);
    const color = pixelRgbAt(pixels, width, x, y);
    result[index * 4 + 3] = 0;

    const neighbors: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighborIndex = ny * width + nx;
      if (visited[neighborIndex]) continue;

      const neighborColor = pixelRgbAt(pixels, width, nx, ny);
      if (colorDistance(color, neighborColor) > colorTolerance) continue;

      visited[neighborIndex] = 1;
      stack.push(neighborIndex);
    }
  }

  return result;
}
