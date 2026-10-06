"use client";

import { useId, useState } from "react";
import { addYears, todayIso } from "@/lib/dates";
import { computeXirr } from "@/modules/finance/service/utility/returns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function formatPercent(rate: number | null) {
  return rate === null ? "—" : `${(rate * 100).toFixed(2)}%`;
}

interface Row {
  id: string;
  date: string;
  amount: number;
}

function newRow(id: string, date: string, amount: number): Row {
  return { id, date, amount };
}

export function XirrCalculator() {
  const idBase = useId();
  const today = todayIso();
  // Two different dates by default — same date for both rows always solves
  // to "not enough data" (no time elapsed for a rate to compound over).
  const [rows, setRows] = useState<Row[]>([
    newRow(`${idBase}-1`, addYears(today, -1), -100000),
    newRow(`${idBase}-2`, today, 130000),
  ]);

  const xirr = computeXirr(
    rows.filter((r) => r.date && r.amount !== 0).map((r) => ({ date: r.date, amount: r.amount })),
    0,
    today,
  );
  // computeXirr always appends a zero "as of today" inflow — harmless here since a
  // zero-amount flow doesn't change the solve, and it keeps this calculator using
  // the exact same function real holdings use rather than a bespoke variant.

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow(`${idBase}-${prev.length + 1}-${Date.now()}`, today, 0)]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">XIRR</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Internal rate of return for cash flows on irregular dates. Same solver as real holdings —
          negative = money out, positive = money in.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Input
                type="date"
                value={row.date}
                onChange={(e) => updateRow(row.id, { date: e.target.value })}
                aria-label={`Cash flow ${i + 1} date`}
              />
              <Input
                type="number"
                step="any"
                value={row.amount}
                onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) || 0 })}
                className="tabular-nums"
                aria-label={`Cash flow ${i + 1} amount`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 2}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            Add cash flow
          </Button>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">XIRR</p>
          <p className="tabular-nums text-xl font-semibold">{formatPercent(xirr)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
