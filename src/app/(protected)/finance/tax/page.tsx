import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentFinancialYear } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { NavCard } from "@/components/ui/nav-card";

export const metadata: Metadata = {
  title: "Tax planning — Personal Life OS",
};

export default function TaxPlanningPage() {
  const fy = getCurrentFinancialYear();

  return (
    <>
      <PageHeader
        title="Tax planning"
        description={`Estimates only for ${fy.label} — not a filing tool, not a substitute for a CA.`}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NavCard
          href="/finance/tax/deductions"
          title="Deductions"
          description="80C and 80D utilization for the current financial year"
        />
        <NavCard
          href="/finance/tax/regime-comparison"
          title="Regime comparison"
          description="Old vs. new regime, estimated tax under each"
        />
        <NavCard
          href="/finance/tax/capital-gains"
          title="Capital gains"
          description="FIFO-matched gains from redemptions"
        />
        <NavCard
          href="/finance/settings"
          title="Settings"
          description="Reference rates and slab rates — now shared with the rest of Finance"
        />
      </div>
    </>
  );
}
