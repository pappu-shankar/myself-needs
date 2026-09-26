import type { PriceProvider, PriceQuote } from "./types";

interface MfApiResponse {
  data?: { date: string; nav: string }[];
}

/**
 * AMFI-sourced NAV via the free, no-key mfapi.in API — `external_code` is
 * the AMFI scheme code. Called only on a manual "Refresh NAV" click, never a
 * background poll. See docs/prd/finance/investments.md.
 */
export const mutualFundNavProvider: PriceProvider = {
  async fetchLatestPrice(schemeCode: string): Promise<PriceQuote> {
    const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`);
    if (!res.ok) {
      throw new Error(`mfapi.in request failed (${res.status}) for scheme code ${schemeCode}`);
    }

    const body = (await res.json()) as MfApiResponse;
    const latest = body.data?.[0];
    if (!latest) {
      throw new Error(`No NAV data returned for scheme code ${schemeCode}`);
    }

    // mfapi.in dates are DD-MM-YYYY; the rest of this app stores YYYY-MM-DD.
    const [day, month, year] = latest.date.split("-");
    return {
      date: `${year}-${month}-${day}`,
      pricePerUnit: Number(latest.nav),
    };
  },
};
