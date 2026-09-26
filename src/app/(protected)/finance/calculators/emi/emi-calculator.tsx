"use client";

import { useMemo, useState } from "react";
import {
  computeAmortizationSchedule,
  computeEmiAmount,
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

/** EMI / Loan calculator — derives the EMI from principal/rate/tenure, then reuses the exact same schedule + prepayment functions as the real Debts view. */
export function EmiCalculator() {
  const [principal, setPrincipal] = useState(2000000);
  const [annualRate, setAnnualRate] = useState(9);
  const [tenureMonths, setTenureMonths] = useState(240);
  const [extraPayment, setExtraPayment] = useState(0);

  const emiAmount = computeEmiAmount(principal, annualRate, tenureMonths);

  const impact = useMemo(
    () =>
      computePrepaymentImpact(
        { outstandingBalance: principal, annualInterestRate: annualRate, emiAmount },
        extraPayment,
      ),
    [principal, annualRate, emiAmount, extraPayment],
  );

  const baselineOnly = useMemo(
    () =>
      computeAmortizationSchedule({
        outstandingBalance: principal,
        annualInterestRate: annualRate,
        emiAmount,
      }),
    [principal, annualRate, emiAmount],
  );

  const schedule = extraPayment > 0 ? impact.withExtra : baselineOnly;
  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">EMI / Loan</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Equated monthly installment — the fixed monthly payment on a loan.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
          <FormField label="Principal" htmlFor="emiPrincipal">
            <Input
              type="number"
              step="any"
              id="emiPrincipal"
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Annual rate %" htmlFor="emiRate">
            <Input
              type="number"
              step="any"
              id="emiRate"
              value={annualRate}
              onChange={(e) => setAnnualRate(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Tenure (months)" htmlFor="emiTenure">
            <Input
              type="number"
              step="1"
              id="emiTenure"
              value={tenureMonths}
              onChange={(e) => setTenureMonths(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField
            label="Hypothetical extra payment / month"
            htmlFor="emiExtra"
            hint="Doesn't affect real data."
          >
            <Input
              type="number"
              step="any"
              min="0"
              id="emiExtra"
              value={extraPayment || ""}
              onChange={(e) => setExtraPayment(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-sm">EMI amount</p>
            <p className="tabular-nums text-xl font-semibold">{formatAmount(emiAmount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Total interest over tenure</p>
            <p className="tabular-nums text-xl font-semibold">{formatAmount(totalInterest)}</p>
          </div>
        </div>

        {extraPayment > 0 && (
          <p className="text-sm">
            Saves{" "}
            <span className="tabular-nums font-medium">{formatAmount(impact.interestSaved)}</span>{" "}
            in interest and <span className="tabular-nums font-medium">{impact.monthsSaved}</span>{" "}
            month{impact.monthsSaved === 1 ? "" : "s"} of tenure.
          </p>
        )}

        <DataTable
          columns={columns}
          data={schedule}
          emptyTitle="No schedule"
          emptyDescription="Enter a principal to see the amortization schedule."
        />
      </CardContent>
    </Card>
  );
}
