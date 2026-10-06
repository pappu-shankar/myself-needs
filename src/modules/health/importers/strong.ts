/**
 * Strong (CSV). Header, per openGym's verified notes (AGPL-3.0):
 * `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE`.
 * `Set Order` is a number, or `W` (warm-up), `D` (drop set), `F` (failure);
 * `Rest Timer` rows are not sets. Weight is in whichever unit the app was set
 * to — pass `weightUnit: "lb"` for a pound export.
 */
import { parseSetTable, type CsvParseOptions } from "./shared";
import type { ParseResult } from "./types";

export function parseStrong(text: string, options: CsvParseOptions = {}): ParseResult {
  return parseSetTable(text, {
    ...options,
    source: "strong",
    defaultTime: "12:00:00",
    perSetTime: false,
    kindOf: (cell) => {
      const order = cell("setOrder").toLowerCase();
      if (order.includes("rest")) return "skip";
      if (order === "w") return "warmup";
      if (order === "d") return "drop";
      if (order === "f") return "failure";
      return "working";
    },
  });
}
