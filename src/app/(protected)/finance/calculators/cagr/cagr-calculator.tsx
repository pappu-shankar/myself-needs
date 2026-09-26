"use client";

import { useState } from "react";
import { computeCagr } from "@/modules/finance/service/utility/returns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

function formatPercent(rate: number | null) {
  return rate === null ? "—" : `${(rate * 100).toFixed(2)}%`;
}

export function CagrCalculator() {
  const [startValue, setStartValue] = useState(100000);
  const [endValue, setEndValue] = useState(200000);
  const [years, setYears] = useState(5);

  const cagr = computeCagr(startValue, endValue, years);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">CAGR</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Compound annual growth rate — the steady annual rate between a start and end value.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Start value" htmlFor="cagrStart">
            <Input
              type="number"
              step="any"
              id="cagrStart"
              value={startValue}
              onChange={(e) => setStartValue(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="End value" htmlFor="cagrEnd">
            <Input
              type="number"
              step="any"
              id="cagrEnd"
              value={endValue}
              onChange={(e) => setEndValue(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Years" htmlFor="cagrYears">
            <Input
              type="number"
              step="any"
              id="cagrYears"
              value={years}
              onChange={(e) => setYears(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">CAGR</p>
          <p className="tabular-nums text-xl font-semibold">{formatPercent(cagr)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
