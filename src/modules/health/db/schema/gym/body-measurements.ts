import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { MEASUREMENT_SITES } from "../../../gym-types";

/** Tape measurements in cm (and directly-measured body fat %), one row per site per entry. */
export const gymBodyMeasurements = sqliteTable(
  "health_body_measurements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    site: text("site", { enum: MEASUREMENT_SITES }).notNull(),
    value: real("value").notNull(),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("health_body_measurements_site_date_idx").on(table.site, table.date)],
);
