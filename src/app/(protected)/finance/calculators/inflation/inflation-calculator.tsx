"use client";

import { useState } from "react";
import {
  computeInflationAdjustedValue,
  computeRealRateOfReturn,
} from "@/modules/finance/service/utility/returns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { formatMoney, toMinor } from "@/lib/format";

/** A calculator works in one currency the user implicitly chose by typing
 * rupees; it reads no stored money. Stated explicitly so the figure is
 * still never formatted without a currency beside it. */
const CURRENCY = "INR";
const money = (major: number) =>
  formatMoney({ minor: toMinor(major, CURRENCY), currency: CURRENCY });

export function InflationCalculator() {
  const [presentValue, setPresentValue] = useState(100000);
  const [inflationRate, setInflationRate] = useState(6);
  const [years, setYears] = useState(10);
  const [nominalRate, setNominalRate] = useState(10);

  const futureEquivalent = computeInflationAdjustedValue(presentValue, inflationRate, years);
  const realRate = computeRealRateOfReturn(nominalRate, inflationRate);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Inflation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Present value" htmlFor="inflationPv">
            <Input
              type="number"
              step="any"
              id="inflationPv"
              value={presentValue}
              onChange={(e) => setPresentValue(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Inflation rate %" htmlFor="inflationRate">
            <Input
              type="number"
              step="any"
              id="inflationRate"
              value={inflationRate}
              onChange={(e) => setInflationRate(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Years" htmlFor="inflationYears">
            <Input
              type="number"
              step="any"
              id="inflationYears"
              value={years}
              onChange={(e) => setYears(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Future equivalent value</p>
          <p className="tabular-nums text-xl font-semibold">{money(futureEquivalent)}</p>
        </div>

        <div className="border-border border-t pt-4">
          <FormField
            label="Nominal rate of return %"
            htmlFor="nominalRate"
            hint="For the real-rate-of-return helper below"
          >
            <Input
              type="number"
              step="any"
              id="nominalRate"
              value={nominalRate}
              onChange={(e) => setNominalRate(Number(e.target.value) || 0)}
              className="tabular-nums max-w-40"
            />
          </FormField>
          <p className="text-muted-foreground mt-3 text-sm">Real rate of return</p>
          <p className="tabular-nums text-xl font-semibold">{realRate.toFixed(2)}%</p>
        </div>
      </CardContent>
    </Card>
  );
}
