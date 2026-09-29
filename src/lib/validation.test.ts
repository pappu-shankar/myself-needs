// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zAmount, zCheckbox, zId, zIsoDate, zOptionalText, zPercent, zText } from "./validation";

describe("shared validators", () => {
  it("zId rejects the 0 that Number(null) produces", () => {
    expect(zId.safeParse("12").data).toBe(12);
    expect(zId.safeParse(undefined).success).toBe(false);
    expect(zId.safeParse("0").success).toBe(false);
    expect(zId.safeParse("1.5").success).toBe(false);
  });

  it("zIsoDate only accepts real YYYY-MM-DD dates", () => {
    expect(zIsoDate.safeParse("2026-04-01").success).toBe(true);
    expect(zIsoDate.safeParse("01/04/2026").success).toBe(false);
    expect(zIsoDate.safeParse("2026-02-30").success).toBe(false);
  });

  it("zAmount allows at most two decimals and rejects non-finite input", () => {
    expect(zAmount.safeParse("1234.56").data).toBe(1234.56);
    expect(zAmount.safeParse("0.1").success).toBe(true);
    expect(zAmount.safeParse("1.234").success).toBe(false);
    expect(zAmount.safeParse("Infinity").success).toBe(false);
    expect(zAmount.safeParse("abc").success).toBe(false);
  });

  it("zPercent is bounded", () => {
    expect(zPercent.safeParse("7.5").data).toBe(7.5);
    expect(zPercent.safeParse("101").success).toBe(false);
  });

  it("text helpers trim and treat blank as missing", () => {
    const schema = z.object({ name: zText("Name"), note: zOptionalText() });
    expect(schema.parse({ name: "  Rent ", note: " " })).toEqual({ name: "Rent", note: undefined });
    expect(schema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("zCheckbox maps presence to a boolean", () => {
    const schema = z.object({ active: zCheckbox });
    expect(schema.parse({ active: "on" }).active).toBe(true);
    expect(schema.parse({}).active).toBe(false);
  });
});
