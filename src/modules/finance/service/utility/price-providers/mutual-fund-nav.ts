import { z } from "zod";
import { DomainError } from "@/modules/core/errors";
import type { PriceProvider, PriceQuote } from "./types";
import { toPriceScaled } from "../units";

const REQUEST_TIMEOUT_MS = 10_000;

/** AMFI scheme codes are plain numbers — anything else is rejected before a request is made. */
const SCHEME_CODE = /^\d{1,10}$/;

/** mfapi.in dates are DD-MM-YYYY; this app stores YYYY-MM-DD. */
function toIsoDate(ddmmyyyy: string): string | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  // Rejects impossible dates like 31-02-2024, which Date would silently roll over.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

const latestNavResponse = z.object({
  data: z
    .array(
      z.object({
        date: z.string().transform((value, ctx) => {
          const iso = toIsoDate(value);
          if (!iso) {
            ctx.addIssue({ code: "custom", message: "Malformed NAV date" });
            return z.NEVER;
          }
          return iso;
        }),
        nav: z.string().transform((value, ctx) => {
          const nav = Number(value);
          if (!Number.isFinite(nav) || nav <= 0) {
            ctx.addIssue({ code: "custom", message: "NAV must be a positive number" });
            return z.NEVER;
          }
          return nav;
        }),
      }),
    )
    .min(1),
});

/**
 * AMFI-sourced NAV via the free, no-key mfapi.in API
 * (`GET /mf/{scheme_code}/latest`, documented at https://www.mfapi.in/docs/)
 * — `external_code` is the public AMFI scheme code, the only thing ever sent.
 * Called only on a manual "Refresh NAV" click, never a background poll. See
 * docs/prd/finance/investments.md.
 *
 * Every failure surfaces as a `DomainError` with a message safe to show.
 */
export const mutualFundNavProvider: PriceProvider = {
  async fetchLatestPrice(schemeCode: string): Promise<PriceQuote> {
    const code = schemeCode.trim();
    if (!SCHEME_CODE.test(code)) {
      throw new DomainError("The AMFI scheme code should be a number, e.g. 119551");
    }

    let res: Response;
    try {
      res = await fetch(`https://api.mfapi.in/mf/${code}/latest`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      // Checked by name: DOMException isn't an `Error` subclass in every runtime.
      const name = (err as { name?: unknown } | null)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new DomainError("The NAV service took too long to respond. Try again later.");
      }
      throw new DomainError("Couldn't reach the NAV service. Check your connection and retry.");
    }

    if (!res.ok) {
      throw new DomainError(`The NAV service returned an error (${res.status}). Try again later.`);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new DomainError("The NAV service sent a response that couldn't be read.");
    }

    const parsed = latestNavResponse.safeParse(body);
    if (!parsed.success) {
      throw new DomainError(`No valid NAV was returned for scheme code ${code}.`);
    }

    const latest = parsed.data.data[0];
    // AMFI publishes NAVs in rupees. Stated here rather than assumed by the
    // caller: a holding denominated in anything else must be refused, not
    // converted, and it can only be refused if the feed says what it means.
    return { date: latest.date, priceScaled: toPriceScaled(latest.nav), currency: "INR" };
  },
};
