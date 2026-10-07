import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { currentFiscalYear, getCapitalGainsEstimate } from "@/modules/finance";
import { STATUTORY_CURRENCY } from "@/modules/finance/service/config/tax";
import { Money } from "../../_components/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { FiscalYearPicker } from "../fiscal-year-picker";
import { PolicyNote } from "../policy-note";
import { fiscalYearOptions, selectedFiscalYear } from "../selected-fiscal-year";

export const metadata: Metadata = {
  title: "Capital gains — Personal Life OS",
};

export default async function CapitalGainsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string | string[] }>;
}) {
  await requireUser();
  const fy = selectedFiscalYear((await searchParams).fy);
  const capitalGains = getCapitalGainsEstimate(fy);

  return (
    <>
      <PageHeader
        title="Capital gains"
        description={`FIFO-matched capital gains estimate for redemptions in FY ${fy.label} (${fy.start} to ${fy.end}).`}
      />

      <FiscalYearPicker
        basePath="/finance/tax/capital-gains"
        years={fiscalYearOptions(fy)}
        selected={fy.label}
        current={currentFiscalYear().label}
      />
      <PolicyNote fiscalYear={fy.label} policyFiscalYear={capitalGains.policyFiscalYear} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Capital gains estimate — FY {fy.label}
          </CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            LTCG = long-term capital gains (held for more than the threshold in Settings), STCG =
            short-term. &quot;Other&quot; covers non-equity holdings — debt, gold, and the rest.
            Equity LTCG is taxed only above the{" "}
            <Money minor={capitalGains.equityLtcgExemptionMinor} currency={STATUTORY_CURRENCY} />{" "}
            yearly exemption.
          </p>
        </CardHeader>
        <CardContent>
          {capitalGains.unconverted.length > 0 && (
            <div
              role="alert"
              className="border-destructive text-destructive mb-4 rounded-md border p-3 text-sm"
            >
              <p className="font-medium">
                This estimate is short: {capitalGains.unconverted.length} cash flow
                {capitalGains.unconverted.length === 1 ? " was" : "s were"} left out because no
                exchange rate to INR was available for its date. The gains and tax below exclude
                them.
              </p>
              <ul className="mt-2 list-disc pl-5">
                {capitalGains.unconverted.map((u, i) => (
                  <li key={`${u.holdingId}-${u.date}-${i}`}>
                    {u.holdingName}, {u.date}: <Money minor={u.minor} currency={u.currency} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* A disposal the FIFO matcher could not account for is a different
              gap from an unconvertible one, and needs a different fix from the
              user — recording the units, or the purchase that is missing. */}
          {capitalGains.unmatched.length > 0 && (
            <div
              role="alert"
              className="border-destructive text-destructive mb-4 rounded-md border p-3 text-sm"
            >
              <p className="font-medium">
                This estimate is short: {capitalGains.unmatched.length} disposal
                {capitalGains.unmatched.length === 1 ? "" : "s"} could not be matched to a cost
                basis, so {capitalGains.unmatched.length === 1 ? "its" : "their"} gain is not
                included.
              </p>
              <ul className="mt-2 list-disc pl-5">
                {capitalGains.unmatched.map((u, i) => (
                  <li key={`${u.holdingId}-${u.date ?? "all"}-${i}`}>
                    {u.holdingName}
                    {u.date ? `, ${u.date}` : ""}:{" "}
                    <Money minor={u.proceedsMinor} currency={STATUTORY_CURRENCY} /> —{" "}
                    {u.reason === "no_units_recorded"
                      ? "no unit count recorded on the sale, so there is nothing to match it against. Edit the sale to add the units."
                      : "more units were sold than were ever recorded as bought. A purchase is missing from this holding's history."}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {capitalGains.netLossMinor > 0 && (
            <p className="text-muted-foreground mb-4 text-sm">
              Net capital loss available for set-off:{" "}
              <span className="text-foreground tabular-nums font-medium">
                <Money minor={capitalGains.netLossMinor} currency={STATUTORY_CURRENCY} />
              </span>
              . No tax is owed on a loss; how it is set off or carried forward is not modelled here.
            </p>
          )}
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-sm">Equity LTCG</p>
              <p className="tabular-nums font-semibold">
                <Money minor={capitalGains.ltcgEquityMinor} currency={STATUTORY_CURRENCY} />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Equity STCG</p>
              <p className="tabular-nums font-semibold">
                <Money minor={capitalGains.stcgEquityMinor} currency={STATUTORY_CURRENCY} />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Other LTCG</p>
              <p className="tabular-nums font-semibold">
                <Money minor={capitalGains.ltcgOtherMinor} currency={STATUTORY_CURRENCY} />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Other STCG</p>
              <p className="tabular-nums font-semibold">
                <Money minor={capitalGains.stcgOtherMinor} currency={STATUTORY_CURRENCY} />
              </p>
            </div>
          </div>
          <p className="mb-4 text-sm">
            Estimated tax:{" "}
            <span className="tabular-nums font-semibold">
              <Money minor={capitalGains.totalTaxMinor} currency={STATUTORY_CURRENCY} />
            </span>
          </p>

          {capitalGains.conversions.length > 0 && (
            <div className="text-muted-foreground mb-4 text-sm">
              <p>Non-INR cash flows were converted to INR at the rate on their own date:</p>
              <ul className="mt-1 list-disc pl-5">
                {capitalGains.conversions.map((c, i) => (
                  <li key={`${c.holdingId}-${c.date}-${i}`} className="tabular-nums">
                    {c.date}: <Money minor={c.minor} currency={c.currency} /> ={" "}
                    <Money minor={c.inrMinor} currency={STATUTORY_CURRENCY} /> at{" "}
                    {(c.rateScaled / 1e8).toFixed(4)} ({c.rateSource}, {c.rateDate})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {capitalGains.events.length === 0 ? (
            <EmptyState
              title={`No matched gains in FY ${fy.label}`}
              description="Log a redemption cash flow against a holding to see FIFO-matched (first-in-first-out) gains."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Holding</TableHead>
                  <TableHead>Redeemed</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Gain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capitalGains.events.map((e, i) => (
                  <TableRow key={`${e.holdingId}-${e.redemptionDate}-${i}`}>
                    <TableCell>{e.holdingName}</TableCell>
                    <TableCell className="tabular-nums">{e.redemptionDate}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{e.category}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.isLongTerm ? "Long-term" : "Short-term"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Money minor={e.gainMinor} currency={STATUTORY_CURRENCY} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
