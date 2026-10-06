"use client";

import { useActionState } from "react";
import {
  setAllocationTargetAction,
  type SetAllocationTargetState,
  setDateOfBirthAction,
  type SetDateOfBirthState,
} from "@/modules/finance/actions/config/allocation";
import type { getAllocationReport, getFinanceSettings } from "@/modules/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { MoneyFigure } from "../_components/money";

type TargetRow = ReturnType<typeof getAllocationReport>["rows"][number];
type Report = ReturnType<typeof getAllocationReport>;
type Settings = ReturnType<typeof getFinanceSettings>;

const CLASS_LABELS: Record<TargetRow["assetClass"], string> = {
  equity: "Equity",
  debt: "Debt",
  gold: "Gold",
  cash: "Cash",
};

const dobInitial: SetDateOfBirthState = {};

function DateOfBirthForm({ settings }: { settings: Settings }) {
  const [state, formAction, isPending] = useActionState(setDateOfBirthAction, dobInitial);

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-4">
      <FormField
        label="Date of birth"
        htmlFor="dateOfBirth"
        hint="Optional — used to suggest an age-based equity/debt split"
      >
        <Input
          key={settings?.dateOfBirth ?? "none"}
          type="date"
          name="dateOfBirth"
          id="dateOfBirth"
          defaultValue={settings?.dateOfBirth ?? ""}
        />
      </FormField>
      <FormFieldAction label="Save">
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </FormFieldAction>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

const targetInitial: SetAllocationTargetState = {};

function TargetRowForm({ row }: { row: TargetRow }) {
  const [state, formAction, isPending] = useActionState(setAllocationTargetAction, targetInitial);
  const isOver = row.variance !== null && row.variance > 0.5;
  const isUnder = row.variance !== null && row.variance < -0.5;

  return (
    <TableRow>
      <TableCell>{CLASS_LABELS[row.assetClass]}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.currentPercentage === null ? "—" : `${row.currentPercentage.toFixed(1)}%`}
      </TableCell>
      <TableCell>
        <form action={formAction} className="flex items-center justify-end gap-2">
          <input type="hidden" name="assetClass" value={row.assetClass} />
          <Input
            key={row.targetPercentage}
            type="number"
            step="any"
            min="0"
            max="100"
            name="targetPercentage"
            defaultValue={row.targetPercentage.toFixed(1)}
            className="w-20 text-right tabular-nums"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
            {isPending ? "…" : "Save"}
          </Button>
        </form>
        {state.error && (
          <p role="alert" className="text-destructive mt-1 text-right text-xs">
            {state.error}
          </p>
        )}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${isOver || isUnder ? "text-destructive" : ""}`}
      >
        {row.variance === null ? "—" : `${row.variance > 0 ? "+" : ""}${row.variance.toFixed(1)}%`}
        {!row.isCustom && <span className="text-muted-foreground ml-1 text-xs">(suggested)</span>}
      </TableCell>
    </TableRow>
  );
}

export function AllocationSection({ report, settings }: { report: Report; settings: Settings }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Target allocation</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          A formula-driven starting point, not financial advice — edit any target to make it yours.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <DateOfBirthForm settings={settings} />
        {!report.netWorth.complete ? (
          <p role="status" className="text-destructive text-sm">
            Current split is not shown: net worth is missing a currency conversion rate, so the
            percentages would be wrong. Net worth so far:{" "}
            <MoneyFigure aggregate={report.netWorth} />.
          </p>
        ) : report.netWorth.baseMinor <= 0 ? (
          <p role="status" className="text-muted-foreground text-sm">
            Current split is not shown while net worth is zero or negative.
          </p>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset class</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((row) => (
              <TargetRowForm key={row.assetClass} row={row} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
