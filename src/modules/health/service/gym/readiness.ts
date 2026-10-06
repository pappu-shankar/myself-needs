import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";
import { READINESS_FIELDS } from "../../gym-types";
import {
  findCheckin,
  listCheckinsBetween,
  upsertCheckin,
  type GymReadinessCheckin,
} from "../../db/queries/gym/readiness";

/**
 * The daily 1–5 self-rating (soreness and stress: 5 = worst). Stored as
 * entered; the readiness score built from it is derived (engine/readiness.ts).
 */

export type ReadinessCheckin = GymReadinessCheckin;

export interface ReadinessCheckinInput {
  sleepQuality: number;
  energy: number;
  soreness: number;
  stress: number;
  motivation: number;
  note?: string | null;
}

const FIELD_LABELS: Record<(typeof READINESS_FIELDS)[number], string> = {
  sleepQuality: "Sleep quality",
  energy: "Energy",
  soreness: "Soreness",
  stress: "Stress",
  motivation: "Motivation",
};

function requireDate(date: string, label = "Date"): void {
  try {
    parseIsoDate(date);
  } catch {
    throw new DomainError(`${label} must be a valid calendar date.`);
  }
}

/** Saves `date`'s check-in, replacing an earlier one that day. */
export function upsertReadinessCheckin(
  date: string,
  input: ReadinessCheckinInput,
): ReadinessCheckin {
  requireDate(date);
  for (const field of READINESS_FIELDS) {
    const value = input[field];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new DomainError(`${FIELD_LABELS[field]} must be a whole number from 1 to 5.`);
    }
  }
  return upsertCheckin({
    date,
    sleepQuality: input.sleepQuality,
    energy: input.energy,
    soreness: input.soreness,
    stress: input.stress,
    motivation: input.motivation,
    note: input.note?.trim() || null,
  });
}

export function getReadinessCheckin(date: string): ReadinessCheckin | null {
  requireDate(date);
  return findCheckin(date) ?? null;
}

/** Check-ins in [from, to], oldest first. */
export function listReadinessCheckins(from: string, to: string): ReadinessCheckin[] {
  requireDate(from, "From date");
  requireDate(to, "To date");
  return listCheckinsBetween(from, to);
}
