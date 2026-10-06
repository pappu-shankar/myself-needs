import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentFiscalYear,
  fiscalYearOf,
  parseFiscalYearLabel,
  shiftFiscalYear,
} from "./fiscal-year";

afterEach(() => {
  vi.useRealTimers();
});

describe("fiscalYearOf", () => {
  it("April 1 starts a new FY", () => {
    expect(fiscalYearOf("2025-04-01")).toEqual({
      label: "2025-26",
      start: "2025-04-01",
      end: "2026-03-31",
    });
  });

  it("March 31 still belongs to the FY that started the previous April", () => {
    expect(fiscalYearOf("2025-03-31")).toEqual({
      label: "2024-25",
      start: "2024-04-01",
      end: "2025-03-31",
    });
  });

  it("handles January and the century rollover label", () => {
    expect(fiscalYearOf("2000-01-15").label).toBe("1999-00");
    expect(fiscalYearOf("2099-12-31").label).toBe("2099-00");
  });

  it("rejects non-ISO input", () => {
    expect(() => fiscalYearOf("01/04/2025")).toThrow(RangeError);
  });
});

describe("currentFiscalYear", () => {
  it("uses the local date: 1 April local time is the new FY", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1, 0, 30)); // local 2026-04-01 00:30
    expect(currentFiscalYear().label).toBe("2026-27");
    vi.setSystemTime(new Date(2026, 2, 31, 23, 59)); // local 2026-03-31 23:59
    expect(currentFiscalYear().label).toBe("2025-26");
  });
});

describe("parseFiscalYearLabel / shiftFiscalYear", () => {
  it("round-trips a valid label and rejects non-consecutive years", () => {
    expect(parseFiscalYearLabel("2024-25")).toEqual(fiscalYearOf("2024-06-01"));
    expect(parseFiscalYearLabel("2024-26")).toBeNull();
    expect(parseFiscalYearLabel("FY 2024-25")).toBeNull();
    expect(parseFiscalYearLabel(undefined)).toBeNull();
  });

  it("shifts by whole years", () => {
    expect(shiftFiscalYear(fiscalYearOf("2024-06-01"), 1).label).toBe("2025-26");
    expect(shiftFiscalYear(fiscalYearOf("2024-06-01"), -1).label).toBe("2023-24");
  });
});
