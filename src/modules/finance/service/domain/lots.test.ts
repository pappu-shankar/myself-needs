import { describe, expect, it } from "vitest";
import { matchHistory, type LedgerEvent } from "./lots";
import { toUnitsScaled } from "../utility/units";

/** ₹ to paise, so the fixtures read as the amounts a statement would show. */
const inr = (rupees: number) => Math.round(rupees * 100);

function buy(date: string, units: number, rupees: number): LedgerEvent {
  return {
    date,
    unitsScaled: toUnitsScaled(units),
    amountMinor: inr(rupees),
    confidence: "reported",
    consumesLots: false,
  };
}

function sell(date: string, units: number, rupees: number): LedgerEvent {
  return {
    date,
    unitsScaled: -toUnitsScaled(units),
    amountMinor: inr(rupees),
    confidence: "reported",
    consumesLots: true,
  };
}

describe("unit-based FIFO matching", () => {
  it("produces a capital LOSS when a sale comes in below its cost basis", () => {
    // The whole reason for this rewrite. 100 units at ₹100 = ₹10,000 cost;
    // sold for ₹8,000. That is a ₹2,000 loss, and the old amount-matching model
    // could only ever report it as a zero-gain event.
    const { matches } = matchHistory([
      buy("2024-01-01", 100, 10_000),
      sell("2024-06-01", 100, 8_000),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].costBasisMinor).toBe(inr(10_000));
    expect(matches[0].proceedsMinor).toBe(inr(8_000));
    expect(matches[0].gainMinor).toBe(inr(-2_000));
  });

  it("consumes the oldest lot first", () => {
    // 10 units at ₹100 then 10 at ₹200. Selling 10 for ₹3,000 must match the
    // ₹1,000 lot, not the ₹2,000 one: gain ₹2,000, not ₹1,000.
    const { matches } = matchHistory([
      buy("2024-01-01", 10, 1_000),
      buy("2024-02-01", 10, 2_000),
      sell("2024-06-01", 10, 3_000),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].acquisitionDate).toBe("2024-01-01");
    expect(matches[0].costBasisMinor).toBe(inr(1_000));
    expect(matches[0].gainMinor).toBe(inr(2_000));
  });

  it("splits a sale that spans two lots, attributing each lot's own date", () => {
    // 10 units at ₹1,000 and 10 at ₹2,000; sell 15 for ₹4,500 (₹300/unit).
    // First lot: 10 units, cost ₹1,000, proceeds ₹3,000 → gain ₹2,000.
    // Second lot: 5 units, cost ₹1,000 (half of ₹2,000), proceeds ₹1,500 → ₹500.
    const { matches } = matchHistory([
      buy("2024-01-01", 10, 1_000),
      buy("2024-02-01", 10, 2_000),
      sell("2024-06-01", 15, 4_500),
    ]);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      acquisitionDate: "2024-01-01",
      costBasisMinor: inr(1_000),
      proceedsMinor: inr(3_000),
      gainMinor: inr(2_000),
    });
    expect(matches[1]).toMatchObject({
      acquisitionDate: "2024-02-01",
      costBasisMinor: inr(1_000),
      proceedsMinor: inr(1_500),
      gainMinor: inr(500),
    });
    // The split is exhaustive: the parts add back to the sale exactly.
    expect(matches.reduce((s, m) => s + m.proceedsMinor, 0)).toBe(inr(4_500));
  });

  it("loses nothing to rounding across repeated partial sales of one lot", () => {
    // A lot whose cost does not divide evenly by its units: ₹1,000.01 over 3
    // units. Selling it off one unit at a time must consume exactly the whole
    // cost — apportioning against the lot's *original* size instead leaks a
    // paisa per sale, and the leak compounds silently.
    const { matches } = matchHistory([
      buy("2024-01-01", 3, 1_000.01),
      sell("2024-02-01", 1, 400),
      sell("2024-03-01", 1, 400),
      sell("2024-04-01", 1, 400),
    ]);

    expect(matches).toHaveLength(3);
    expect(matches.reduce((s, m) => s + m.costBasisMinor, 0)).toBe(inr(1_000.01));
    // And the gains add back to proceeds minus the whole cost, to the paisa.
    expect(matches.reduce((s, m) => s + m.gainMinor, 0)).toBe(inr(1_200) - inr(1_000.01));
  });

  it("reports units a sale claimed that no lot could supply, rather than clamping", () => {
    // Selling 10 units when only 4 were ever bought means the history is
    // incomplete. A clamped match would present a gain computed from a cost
    // basis that does not exist as though it were sound.
    const result = matchHistory([buy("2024-01-01", 4, 400), sell("2024-06-01", 10, 2_000)]);

    expect(result.unmatchedUnitsScaled).toBe(toUnitsScaled(6));
    // 4 of 10 units matched, so ₹800 of the ₹2,000 is accounted for.
    expect(result.matches[0].proceedsMinor).toBe(inr(800));
    expect(result.unmatchedProceedsMinor).toBe(inr(1_200));
  });

  it("does not let a dividend consume a lot", () => {
    // A dividend is money received that sells nothing. Counting it as a
    // disposal would both invent a gain and leave fewer units behind than are
    // actually held.
    const dividend: LedgerEvent = {
      date: "2024-03-01",
      unitsScaled: 0,
      amountMinor: inr(500),
      confidence: "reported",
      consumesLots: false,
    };
    const { matches } = matchHistory([
      buy("2024-01-01", 10, 1_000),
      dividend,
      sell("2024-06-01", 10, 1_500),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].costBasisMinor).toBe(inr(1_000));
    expect(matches[0].gainMinor).toBe(inr(500));
  });

  it("treats a same-day purchase as available to that day's sale", () => {
    const { matches } = matchHistory([sell("2024-01-01", 5, 750), buy("2024-01-01", 10, 1_000)]);

    expect(matches).toHaveLength(1);
    expect(matches[0].costBasisMinor).toBe(inr(500));
    expect(matches[0].gainMinor).toBe(inr(250));
  });

  it("carries the weaker of the two flows' confidences", () => {
    const { matches } = matchHistory([
      { ...buy("2024-01-01", 10, 1_000), confidence: "verified" },
      { ...sell("2024-06-01", 10, 1_500), confidence: "estimated" },
    ]);

    expect(matches[0].confidence).toBe("estimated");
  });

  it("matches a later sale against what an earlier sale left behind", () => {
    // 10 at ₹100 then 10 at ₹200. Sell 10, then 10 again. The second sale must
    // see only the ₹200 lot — which is why the whole history has to be walked
    // even when one year's gains are wanted.
    const { matches } = matchHistory([
      buy("2024-01-01", 10, 1_000),
      buy("2024-02-01", 10, 2_000),
      sell("2024-06-01", 10, 1_500),
      sell("2024-07-01", 10, 1_500),
    ]);

    expect(matches).toHaveLength(2);
    expect(matches[0].gainMinor).toBe(inr(500));
    // Sold below the ₹2,000 lot's cost: a ₹500 loss.
    expect(matches[1].acquisitionDate).toBe("2024-02-01");
    expect(matches[1].gainMinor).toBe(inr(-500));
  });
});
