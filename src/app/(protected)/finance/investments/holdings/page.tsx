import type { Metadata } from "next";
import Link from "next/link";
import {
  getAccounts,
  getSchemeTemplates,
  getHoldingsWithValue,
  getCashFlowsForHolding,
  getValuationsForHolding,
} from "@/modules/finance";
import { getGoals } from "@/modules/plans";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { AddHoldingDialog } from "./add-holding-dialog";
import { HoldingDetail } from "./holding-detail";
import { HoldingsTable } from "./holdings-table";

export const metadata: Metadata = {
  title: "Holdings — Investments — Personal Life OS",
};

export default function HoldingsPage() {
  const accounts = getAccounts();
  const schemeTemplates = getSchemeTemplates();
  const holdings = getHoldingsWithValue();
  // Cross-module composition at the app layer, not a finance→plans import —
  // see docs/prd/finance/goal-linked-investments.md.
  const goals = getGoals();
  const goalNameById = new Map(goals.map((g) => [g.id, g.name]));

  const cashFlowsByHolding = Object.fromEntries(
    holdings.map((h) => [h.id, getCashFlowsForHolding(h.id)]),
  );
  const valuationsByHolding = Object.fromEntries(
    holdings.map((h) => [h.id, getValuationsForHolding(h.id)]),
  );

  return (
    <>
      <PageHeader
        title="Holdings"
        description="Add holdings, record cash flows and valuations, refresh mutual fund NAVs."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/finance/investments" />}
          >
            Back to Investments
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">All holdings</h2>
        <AddHoldingDialog accounts={accounts} schemeTemplates={schemeTemplates} goals={goals} />
      </div>

      {holdings.length === 0 ? (
        <EmptyState
          title="No holdings yet"
          description="Add your first holding to get started."
          className="mb-6"
        />
      ) : (
        <Card className="mb-6">
          <CardContent>
            <HoldingsTable holdings={holdings} goalNameById={goalNameById} />
          </CardContent>
        </Card>
      )}

      <div className="mb-6">
        <HoldingDetail
          key={holdings[0]?.id ?? "none"}
          holdings={holdings}
          cashFlowsByHolding={cashFlowsByHolding}
          valuationsByHolding={valuationsByHolding}
        />
      </div>
    </>
  );
}
