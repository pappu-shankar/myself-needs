export interface PriceQuote {
  /** YYYY-MM-DD */
  date: string;
  pricePerUnit: number;
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
