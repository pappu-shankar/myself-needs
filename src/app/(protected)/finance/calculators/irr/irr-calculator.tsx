"use client";

import { useId, useState } from "react";
import { computeIrr } from "@/modules/finance/service/utility/returns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function formatPercent(rate: number | null) {
  return rate === null ? "—" : `${(rate * 100).toFixed(2)}%`;
}

interface Row {
  id: string;
  amount: number;
}

export function IrrCalculator() {
  const idBase = useId();
  const [rows, setRows] = useState<Row[]>([
    { id: `${idBase}-0`, amount: -100000 },
    { id: `${idBase}-1`, amount: 30000 },
    { id: `${idBase}-2`, amount: 30000 },
    { id: `${idBase}-3`, amount: 30000 },
    { id: `${idBase}-4`, amount: 40000 },
  ]);

  const irr = computeIrr(rows.map((r) => r.amount));

  function updateRow(id: string, amount: number) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, amount } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { id: `${idBase}-${prev.length}-${Date.now()}`, amount: 0 }]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">IRR</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Internal rate of return. Evenly-spaced periods, not real dates — period 0 is the initial
          outflow.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={row.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
              <span className="text-muted-foreground w-16 text-sm tabular-nums">Period {i}</span>
              <Input
                type="number"
                step="any"
                value={row.amount}
                onChange={(e) => updateRow(row.id, Number(e.target.value) || 0)}
                className="tabular-nums"
                aria-label={`Period ${i} amount`}
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
            Add period
          </Button>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">IRR</p>
          <p className="tabular-nums text-xl font-semibold">{formatPercent(irr)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
