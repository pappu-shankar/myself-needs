import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";
import {
  MEASUREMENT_LABELS,
  MEASUREMENT_SITES,
  measurementUnit,
  type MeasurementSite,
} from "../../gym-types";
import {
  countMeasurementRows,
  deleteMeasurementRow,
  findMeasurement,
  insertMeasurementRows,
  listLatestPerSite,
  listMeasurementRows,
  listMeasurementSeries,
  type GymBodyMeasurement,
} from "../../db/queries/gym/measurements";

/** Tape measurements (cm) and directly-measured body fat (%), one row per site. */

export type BodyMeasurement = GymBodyMeasurement;

/** Plausible bounds per unit; anything outside is a typo, not a body. */
export const MEASUREMENT_RANGES = {
  cm: { min: 1, max: 300 },
  "%": { min: 2, max: 70 },
} as const;

export interface AddMeasurementsInput {
  date: string;
  entries: Array<{ site: MeasurementSite; value: number }>;
  note?: string | null;
}

/** Saves one measuring session — several sites, one date — all or nothing. */
export function addMeasurements({ date, entries, note }: AddMeasurementsInput): BodyMeasurement[] {
  try {
    parseIsoDate(date);
  } catch {
    throw new DomainError("Date must be a valid calendar date.");
  }
  if (entries.length === 0) throw new DomainError("Enter at least one measurement.");
  const seen = new Set<MeasurementSite>();
  for (const { site, value } of entries) {
    if (!MEASUREMENT_SITES.includes(site)) throw new DomainError("Unknown measurement site.");
    if (seen.has(site)) {
      throw new DomainError(`${MEASUREMENT_LABELS[site]} is entered more than once.`);
    }
    seen.add(site);
    const unit = measurementUnit(site);
    const { min, max } = MEASUREMENT_RANGES[unit];
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new DomainError(
        `${MEASUREMENT_LABELS[site]} must be between ${min} and ${max} ${unit}.`,
      );
    }
  }
  const cleanNote = note?.trim() || null;
  return insertMeasurementRows(
    entries.map(({ site, value }) => ({ date, site, value, note: cleanNote })),
  );
}

export interface ListMeasurementsOptions {
  site?: MeasurementSite;
  from?: string;
  limit?: number;
  offset?: number;
}

/** Newest first, one page. */
export function listMeasurements({
  site,
  from,
  limit = 50,
  offset = 0,
}: ListMeasurementsOptions = {}): { rows: BodyMeasurement[]; total: number } {
  const pageSize = Math.min(Math.max(Math.floor(limit), 1), 200);
  return {
    rows: listMeasurementRows({ site, from }, pageSize, Math.max(Math.floor(offset), 0)),
    total: countMeasurementRows({ site, from }),
  };
}

/** One site's readings, oldest first — for its trend line. */
export function getMeasurementSeries(site: MeasurementSite) {
  return listMeasurementSeries(site);
}

/** The newest reading of each site that has one. */
export function latestMeasurements(): Partial<
  Record<MeasurementSite, { value: number; date: string }>
> {
  const latest: Partial<Record<MeasurementSite, { value: number; date: string }>> = {};
  for (const row of listLatestPerSite()) latest[row.site] = { value: row.value, date: row.date };
  return latest;
}

export function deleteMeasurement(id: number): void {
  if (!findMeasurement(id)) throw new DomainError("That measurement no longer exists.");
  deleteMeasurementRow(id);
}
