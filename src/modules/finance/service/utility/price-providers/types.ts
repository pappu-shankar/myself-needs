import type { Currency } from "../../../db/schema/currency";

export interface PriceQuote {
  /** YYYY-MM-DD */
  date: string;
  /** Scaled by `PRICE_SCALE` (1e6), like every stored price. A provider
   * converts its own representation once, at its boundary, so no caller
   * handles a float price. */
  priceScaled: number;
  /**
   * The currency the feed publishes in — stated, never assumed. A quote
   * recorded against a holding denominated in something else would value the
   * position at the wrong scale, and the only safe response is to refuse,
   * because inventing a conversion rate here would hide the mismatch.
   */
  currency: Currency;
}

/**
 * A source of the latest price for one holding's `external_code`. Equity,
 * international equity, and gold have no reliable free public API today and
 * stay manual-entry-only; a provider for any of them (including a paid API
 * key) can be added later without touching the holdings schema, UI, or any
 * calculation — they'd all implement this same interface.
 * See docs/prd/finance/investments.md.
 */
export interface PriceProvider {
  fetchLatestPrice(externalCode: string): Promise<PriceQuote>;
}
