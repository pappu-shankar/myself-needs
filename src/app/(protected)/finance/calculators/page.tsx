import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { NavCard } from "@/components/ui/nav-card";

export const metadata: Metadata = {
  title: "Calculators — Personal Life OS",
};

/**
 * Standalone, stateless — no DB reads/writes. Every calculator (and its sub-page)
 * calls the exact same pure functions (`service/returns.ts`, `service/loans.ts`)
 * that power the real per-holding/portfolio/debt numbers elsewhere, so sandbox
 * and real numbers are never computed two different ways. See
 * docs/prd/finance/calculators.md.
 */
export default async function CalculatorsPage() {
  await requireUnlocked();
  return (
    <>
      <PageHeader
        title="Calculators"
        description="Sandbox math — nothing here reads or writes your real data."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <div className="flex flex-col gap-2">
        <NavCard
          href="/finance/calculators/sip"
          title="SIP Calculator"
          description="Future value of a fixed monthly investment."
        />
        <NavCard
          href="/finance/calculators/lumpsum"
          title="Lumpsum Calculator"
          description="Future value of a one-time investment."
        />
        <NavCard
          href="/finance/calculators/cagr"
          title="CAGR Calculator"
          description="Compound annual growth rate between a start and end value."
        />
        <NavCard
          href="/finance/calculators/xirr"
          title="XIRR Calculator"
          description="Internal rate of return for cash flows on irregular dates."
        />
        <NavCard
          href="/finance/calculators/irr"
          title="IRR Calculator"
          description="Internal rate of return for evenly-spaced periods."
        />
        <NavCard
          href="/finance/calculators/inflation"
          title="Inflation Calculator"
          description="Inflation-adjusted future value and real rate of return."
        />
        <NavCard
          href="/finance/calculators/emi"
          title="EMI Calculator"
          description="Equated monthly installment on a loan."
        />
      </div>
    </>
  );
}
