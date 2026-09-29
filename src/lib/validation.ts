import { z } from "zod";

/**
 * Shared Zod building blocks for Server Action inputs. FormData arrives as
 * strings with blanks already turned into `undefined` (see `formDataToObject`),
 * so "required" means "present" and optional fields simply use `.optional()`.
 */

export const zId = z.coerce
  .number({ error: "Missing or invalid id" })
  .int({ error: "Missing or invalid id" })
  .positive({ error: "Missing or invalid id" });

export const zIsoDate = z.iso.date({ error: "Enter a valid date" });

/** Any finite number (negatives allowed). */
export const zNumber = z.coerce
  .number({ error: "Enter a number" })
  .refine(Number.isFinite, "Enter a number");

export const zPositiveNumber = zNumber.refine((n) => n > 0, "Must be more than zero");

export const zNonNegativeNumber = zNumber.refine((n) => n >= 0, "Can't be negative");

/** Money in rupees: finite, at most two decimal places. */
export const zAmount = zNumber.refine(
  (n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6,
  "Use at most two decimal places",
);

export const zPositiveAmount = zAmount.refine((n) => n > 0, "Must be more than zero");

/** Percentage entered as a number like 7.5 (not 0.075). */
export const zPercent = zNumber.refine((n) => n >= 0 && n <= 100, "Must be between 0 and 100");

/** Required free text, trimmed. */
export function zText(label: string, max = 200) {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);
}

/** Optional free text, trimmed; blank becomes undefined. */
export function zOptionalText(max = 1000) {
  return z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((value) => (value ? value : undefined));
}

/** HTML checkbox: present ("on") = true, absent = false. */
export const zCheckbox = z
  .union([z.literal("on"), z.literal("true"), z.boolean()])
  .optional()
  .transform((value) => value === "on" || value === "true" || value === true);

/** `#rrggbb` colour. */
export const zHexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid colour");

/** An end date on or after a start date, for use in `.refine` on the object. */
export function endNotBeforeStart(start?: string, end?: string): boolean {
  return !start || !end || end >= start;
}
