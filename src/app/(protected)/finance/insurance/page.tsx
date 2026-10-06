import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { todayIso } from "@/lib/dates";
import Link from "next/link";
import { getRecurringRules, getInsurancePolicies } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
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
import { AddInsuranceDialog } from "./add-insurance-dialog";

export const metadata: Metadata = {
  title: "Insurance — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function InsurancePage() {
  await requireUser();
  const recurringRules = getRecurringRules();
  const insurancePolicies = getInsurancePolicies();
  const today = todayIso();

  return (
    <>
      <PageHeader
        title="Insurance"
        description="Life, health, term, and vehicle insurance policies."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Insurance policies</h2>
        <AddInsuranceDialog recurringRules={recurringRules} />
      </div>

      {insurancePolicies.length === 0 ? (
        <EmptyState
          title="No insurance policies yet"
          description="Add one to get started — life, health, term, or vehicle."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Renewal date</TableHead>
                <TableHead>Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {insurancePolicies.map((p) => {
                const renewalPassed = p.renewalDate != null && p.renewalDate < today;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.provider} — {p.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">{p.type}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(p.premiumAmount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {p.premiumFrequency.replace("_", "-")}
                    </TableCell>
                    <TableCell
                      className={`tabular-nums ${renewalPassed ? "text-destructive" : ""}`}
                    >
                      {p.renewalDate ?? "—"}
                      {renewalPassed ? " (passed)" : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {[p.is80cEligible ? "80C" : null, p.is80dEligible ? "80D" : null]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
