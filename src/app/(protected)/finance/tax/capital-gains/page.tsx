import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { currentFiscalYear, getCapitalGainsEstimate } from "@/modules/finance";
import { formatAmount } from "@/lib/format";
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
import { Button } from "@/components/ui/button";
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
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance/tax" />}>
            Back to Tax planning
          </Button>
        }
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
            Equity LTCG is taxed only above the {formatAmount(capitalGains.equityLtcgExemption)}{" "}
            yearly exemption.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-sm">Equity LTCG</p>
              <p className="tabular-nums font-semibold">{formatAmount(capitalGains.ltcgEquity)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Equity STCG</p>
              <p className="tabular-nums font-semibold">{formatAmount(capitalGains.stcgEquity)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Other LTCG</p>
              <p className="tabular-nums font-semibold">{formatAmount(capitalGains.ltcgOther)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Other STCG</p>
              <p className="tabular-nums font-semibold">{formatAmount(capitalGains.stcgOther)}</p>
            </div>
          </div>
          <p className="mb-4 text-sm">
            Estimated tax:{" "}
            <span className="tabular-nums font-semibold">
              {formatAmount(capitalGains.totalTax)}
            </span>
          </p>

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
                      {formatAmount(e.gain)}
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
