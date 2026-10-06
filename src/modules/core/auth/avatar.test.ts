// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DomainError } from "@/modules/core/errors";
import { parseAvatar } from "./avatar";

function jpeg(width: number, height: number): Buffer {
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

function webpVp8x(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(22, 4);
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt32LE(10, 16);
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

describe("parseAvatar", () => {
  it("accepts small JPEG and WebP images (raw base64 or data URL)", () => {
    expect(parseAvatar(jpeg(128, 96).toString("base64")).format).toBe("jpeg");
    expect(
      parseAvatar(`data:image/webp;base64,${webpVp8x(256, 256).toString("base64")}`).format,
    ).toBe("webp");
  });

  it("rejects oversized dimensions", () => {
    expect(() => parseAvatar(jpeg(512, 100).toString("base64"))).toThrow(/256/);
    expect(() => parseAvatar(webpVp8x(100, 300).toString("base64"))).toThrow(/256/);
  });

  it("checks the magic number, not the claimed type", () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    expect(() => parseAvatar(`data:image/jpeg;base64,${png.toString("base64")}`)).toThrow(
      DomainError,
    );
    expect(() => parseAvatar("not base64 !!")).toThrow(DomainError);
  });

  it("rejects files over 200 KB", () => {
    const big = Buffer.concat([jpeg(10, 10), Buffer.alloc(210 * 1024)]);
    expect(() => parseAvatar(big.toString("base64"))).toThrow(/200 KB/);
  });
});
