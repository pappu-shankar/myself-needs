/**
 * Nearest-neighbor resize of a binary/byte mask — MediaPipe's segmentation
 * mask is typically produced at the model's own internal resolution, not
 * the source photo's, so it needs scaling up before it can be applied
 * pixel-for-pixel against the full-resolution canvas. Pure, unit-testable.
 */
export function resizeMask(
  mask: Uint8Array,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): Uint8Array {
  if (fromWidth === toWidth && fromHeight === toHeight) return mask;

  const resized = new Uint8Array(toWidth * toHeight);
  for (let y = 0; y < toHeight; y++) {
    const srcY = Math.min(fromHeight - 1, Math.floor((y / toHeight) * fromHeight));
    const srcRowOffset = srcY * fromWidth;
    const dstRowOffset = y * toWidth;
    for (let x = 0; x < toWidth; x++) {
      const srcX = Math.min(fromWidth - 1, Math.floor((x / toWidth) * fromWidth));
      resized[dstRowOffset + x] = mask[srcRowOffset + srcX];
    }
  }
  return resized;
}
