/**
 * Hevy (CSV). Header, per openGym's verified notes (AGPL-3.0):
 * `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe`
 * (newer exports may use `weight_lbs`). `set_type` is `normal`, `warmup`,
 * `failure` or `dropset`.
 */
import { parseSetTable, type CsvParseOptions } from "./shared";
import type { ParseResult } from "./types";

export function parseHevy(text: string, options: CsvParseOptions = {}): ParseResult {
  return parseSetTable(text, {
    ...options,
    source: "hevy",
    defaultTime: "12:00:00",
    perSetTime: false,
    kindOf: (cell) => {
      const type = cell("setType")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      if (type.startsWith("warm")) return "warmup";
      if (type.startsWith("drop")) return "drop";
      if (type.startsWith("fail")) return "failure";
      return "working";
    },
  });
}
