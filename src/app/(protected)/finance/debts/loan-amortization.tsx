"use client";

import { useMemo, useState } from "react";
import {
  computeAmortizationSchedule,
  computePrepaymentImpact,
  type AmortizationRow,
} from "@/modules/finance/service/utility/loans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface LoanForAmortization {
  id: number;
  name: string;
  outstandingBalance: number;
  annualInterestRate: number;
  emiAmount: number;
}

const columns: DataTableColumnDef<AmortizationRow>[] = [
  { accessorKey: "period", header: "EMI #", meta: { width: "80px" } },
  {
    accessorKey: "openingBalance",
    header: "Opening balance",
    meta: { align: "right" },
    cell: ({ getValue }) => formatAmount(getValue<number>()),
  },
  {
    accessorKey: "interest",
    header: "Interest",
    meta: { align: "right" },
    cell: ({ getValue }) => formatAmount(getValue<number>()),
  },
  {
    accessorKey: "principal",
    header: "Principal",
    meta: { align: "right" },
    cell: ({ getValue }) => formatAmount(getValue<number>()),
  },
  {
    accessorKey: "closingBalance",
    header: "Closing balance",
    meta: { align: "right" },
    cell: ({ getValue }) => formatAmount(getValue<number>()),
  },
];

/**
 * Prepayment-impact sandbox reusing the exact same `service/loans.ts`
 * functions as the standalone EMI calculator (docs/prd/finance/calculators.md)
 * — a hypothetical extra payment never touches real data, it only recomputes
 * this schedule client-side.
 */
export function LoanAmortization({ loans }: { loans: LoanForAmortization[] }) {
  const [selectedId, setSelectedId] = useState<number | undefined>(loans[0]?.id);
  const [extraPayment, setExtraPayment] = useState(0);

  const loan = loans.find((l) => l.id === selectedId);

  const impact = useMemo(() => {
    if (!loan) return null;
    return computePrepaymentImpact(
      {
        outstandingBalance: loan.outstandingBalance,
        annualInterestRate: loan.annualInterestRate,
        emiAmount: loan.emiAmount,
      },
      extraPayment,
    );
  }, [loan, extraPayment]);

  const baselineOnly = useMemo(() => {
    if (!loan || extraPayment > 0) return null;
    return computeAmortizationSchedule({
      outstandingBalance: loan.outstandingBalance,
      annualInterestRate: loan.annualInterestRate,
      emiAmount: loan.emiAmount,
    });
  }, [loan, extraPayment]);

  if (loans.length === 0) return null;

  const schedule = extraPayment > 0 ? (impact?.withExtra ?? []) : (baselineOnly ?? []);
  const notAmortizing = schedule.length >= 600;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Amortization schedule</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
          <FormField label="Loan" htmlFor="loanId">
            <select
              id="loanId"
              value={selectedId}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="border-input bg-background h-8 rounded-md border px-3 text-sm"
            >
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Hypothetical extra payment / month"
            htmlFor="extraPayment"
            hint="Doesn't affect real data."
          >
            <Input
              type="number"
              step="any"
              min="0"
              id="extraPayment"
              value={extraPayment || ""}
              onChange={(e) => setExtraPayment(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
        </div>

        {notAmortizing ? (
          <p className="text-destructive text-sm">
            This EMI doesn&apos;t cover the monthly interest — the loan won&apos;t pay off at this
            rate. Try a larger EMI or extra payment.
          </p>
        ) : (
          <>
            {extraPayment > 0 && impact && (
              <p className="text-sm">
                Saves{" "}
                <span className="tabular-nums font-medium">
                  {formatAmount(impact.interestSaved)}
                </span>{" "}
                in interest and{" "}
                <span className="tabular-nums font-medium">{impact.monthsSaved}</span> month
                {impact.monthsSaved === 1 ? "" : "s"} of tenure.
              </p>
            )}
            <DataTable
              columns={columns}
              data={schedule}
              emptyTitle="No schedule"
              emptyDescription="This loan has no outstanding balance."
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
