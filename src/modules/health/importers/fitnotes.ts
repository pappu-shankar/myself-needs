/**
 * FitNotes (CSV), both variants (formats per openGym's verified notes, AGPL-3.0):
 *  - Android: `Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment`
 *  - iOS ("FitNotes 2"): `Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind`
 * One row per set, dates only (no clock, no workout name), so each day becomes
 * one workout starting at 12:00. `Time` is a per-set duration (`hh:mm:ss`).
 * Weight units are read per row, so a history recorded partly in lb and partly
 * in kg converts correctly.
 */
import { parseSetTable, type CsvParseOptions } from "./shared";
import type { ParseResult } from "./types";

export function parseFitNotes(text: string, options: CsvParseOptions = {}): ParseResult {
  return parseSetTable(text, {
    ...options,
    source: "fitnotes",
    defaultTime: "12:00:00",
    perSetTime: true,
    kindOf: (cell) => (cell("setType").toLowerCase().includes("warm") ? "warmup" : "working"),
  });
}
