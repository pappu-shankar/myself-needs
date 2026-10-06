import { formatMoney, formatMoneyAmount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MoneyAggregate } from "@/modules/finance";
import type { ConfidenceLevel } from "@/modules/finance";

/**
 * How a converted total is displayed.
 *
 * Every aggregate in this module carries the rate it used, whether that rate
 * was stale, whether a currency failed to resolve at all, and how much of the
 * value rests on estimates. The point of putting that in the return type was so
 * the UI could say it — a figure that silently drops an unconvertible currency
 * reads as a smaller portfolio, not as a missing rate, and nothing downstream
 * can tell the difference. So this component never renders a bare number from
 * an incomplete aggregate without the caveat attached.
 *
 * See docs/prd/finance/provenance-lifecycle.md and currency-fx.md.
 */

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  verified: "Verified",
  reported: "As entered",
  estimated: "Estimated",
  unknown: "Unknown source",
};

/** `unknown` and `estimated` are worth flagging; `verified` and `reported` are
 * the ordinary cases and a badge on every figure would train people to ignore
 * all of them. */
const CONFIDENCE_VARIANT: Record<ConfidenceLevel, "secondary" | "outline" | null> = {
  verified: null,
  reported: null,
  estimated: "secondary",
  unknown: "outline",
};

export function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  const variant = CONFIDENCE_VARIANT[confidence];
  if (!variant) return null;
  return (
    <Badge variant={variant} className="align-middle">
      {CONFIDENCE_LABEL[confidence]}
    </Badge>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** "71% verified, 29% estimated" — by share of value, not by row count, so one
 * large estimated holding is not averaged away by fifty small verified ones. */
export function confidenceMixLabel(aggregate: MoneyAggregate): string | null {
  const mix = aggregate.confidenceMix.filter((m) => m.share > 0);
  if (mix.length <= 1) return null;
  return mix
    .map((m) => `${percent(m.share)} ${CONFIDENCE_LABEL[m.confidence].toLowerCase()}`)
    .join(", ");
}

/**
 * The money figure itself, with the basis behind it reachable on hover and the
 * unavoidable caveats shown inline.
 */
export function MoneyFigure({
  aggregate,
  wholeUnits = false,
  className,
}: {
  aggregate: MoneyAggregate;
  wholeUnits?: boolean;
  className?: string;
}) {
  const formatted = formatMoney(
    { minor: aggregate.baseMinor, currency: aggregate.baseCurrency },
    { wholeUnits },
  );
  const converted = aggregate.byCurrency.filter((c) => c.rateSource !== "identity");
  const unresolved = aggregate.byCurrency.filter((c) => c.baseMinor === null);
  const mix = confidenceMixLabel(aggregate);

  // Nothing crossed a currency boundary and nothing is estimated: show the
  // number plainly rather than decorating every figure in the app.
  if (converted.length === 0 && aggregate.complete && !mix) {
    return (
      <span className={className}>
        {formatted}
        <ConfidenceBadge confidence={aggregate.confidence} />
      </span>
    );
  }

  return (
    <span className={className}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="underline decoration-dotted decoration-muted-foreground underline-offset-4"
              tabIndex={0}
            />
          }
        >
          {formatted}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <ConversionBasis aggregate={aggregate} />
        </TooltipContent>
      </Tooltip>
      {!aggregate.complete && (
        <Badge variant="destructive" className="ml-1 align-middle">
          {unresolved.length === 1
            ? `Excludes ${unresolved[0].currency}`
            : `Excludes ${unresolved.length} currencies`}
        </Badge>
      )}
      {aggregate.stale && (
        <Badge variant="outline" className="ml-1 align-middle">
          Stale rate
        </Badge>
      )}
      {aggregate.complete && <ConfidenceBadge confidence={aggregate.confidence} />}
    </span>
  );
}

/** The per-currency breakdown: what each currency contributed, at what rate,
 * from which source and as of when. This is what makes a converted total
 * auditable instead of asserted. */
export function ConversionBasis({ aggregate }: { aggregate: MoneyAggregate }) {
  const mix = confidenceMixLabel(aggregate);
  return (
    <div className="space-y-1 text-xs">
      <ul className="space-y-0.5">
        {aggregate.byCurrency.map((c) => (
          <li key={c.currency}>
            {formatMoneyAmount({ minor: c.minor, currency: c.currency })} {c.currency}
            {c.rateSource === "identity" ? null : c.baseMinor === null ? (
              <> — no rate available on or before this date, so it is not included</>
            ) : (
              <>
                {" "}
                at {(c.rateScaled! / 1e8).toFixed(4)} ({c.rateSource}, {c.rateDate})
              </>
            )}
          </li>
        ))}
      </ul>
      {mix && <p className="text-muted-foreground">{mix}</p>}
    </div>
  );
}

/** A plain money value that is not an aggregate — a single row's own amount,
 * already in its own currency. Still never formatted without that currency. */
export function Money({
  minor,
  currency,
  wholeUnits = false,
  className,
}: {
  minor: number;
  currency: string;
  wholeUnits?: boolean;
  className?: string;
}) {
  return <span className={className}>{formatMoney({ minor, currency }, { wholeUnits })}</span>;
}
