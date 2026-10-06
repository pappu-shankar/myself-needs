import { describe, expect, it } from "vitest";
import { firstLine, parseCsv, sniffDelimiter } from "./csv";

describe("parseCsv", () => {
  it("reads plain rows and drops blank lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n\n4,5,6\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted commas, escaped quotes and embedded newlines", () => {
    const text = 'name,notes\n"Bench Press, Close Grip","He said ""go"""\nCurl,"line1\nline2"\n';
    expect(parseCsv(text)).toEqual([
      ["name", "notes"],
      ["Bench Press, Close Grip", 'He said "go"'],
      ["Curl", "line1\nline2"],
    ]);
  });

  it("handles CRLF and a BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty cells and a last row without a trailing newline", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("sniffs a semicolon delimiter", () => {
    expect(sniffDelimiter("Date;Exercise;Weight")).toBe(";");
    expect(sniffDelimiter('"a,b,c";d;e')).toBe(";");
    expect(parseCsv("Date;Exercise;Weight\n2024-05-01;Squat;100,5\n")).toEqual([
      ["Date", "Exercise", "Weight"],
      ["2024-05-01", "Squat", "100,5"],
    ]);
  });

  it("finds the first line", () => {
    expect(firstLine("﻿a,b\r\nc")).toBe("a,b");
  });
});
