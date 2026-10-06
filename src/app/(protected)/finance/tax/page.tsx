import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { currentFiscalYear } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { NavCard } from "@/components/ui/nav-card";

export const metadata: Metadata = {
  title: "Tax planning — Personal Life OS",
};

export default async function TaxPlanningPage() {
  await requireUser();
  const fy = currentFiscalYear();

  return (
    <>
      <PageHeader
        title="Tax planning"
        description={`Estimates only — defaults to the current FY ${fy.label}. Not a filing tool, not a substitute for a CA.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NavCard
          href="/finance/tax/deductions"
          title="Deductions"
          description="80C and 80D utilization per financial year"
        />
        <NavCard
          href="/finance/tax/regime-comparison"
          title="Regime comparison"
          description="Old vs. new regime, estimated tax under each"
        />
        <NavCard
          href="/finance/tax/capital-gains"
          title="Capital gains"
          description="FIFO-matched gains from redemptions in a financial year"
        />
        <NavCard
          href="/finance/settings"
          title="Settings"
          description="Per-FY reference rates and slab brackets — shared with the rest of Finance"
        />
      </div>
    </>
  );
}
