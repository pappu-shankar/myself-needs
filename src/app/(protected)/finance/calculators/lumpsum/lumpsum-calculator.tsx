"use client";

import { useState } from "react";
import { computeLumpsumFutureValue } from "@/modules/finance/service/utility/returns";
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

export function LumpsumCalculator() {
  const [principal, setPrincipal] = useState(100000);
  const [annualRate, setAnnualRate] = useState(10);
  const [years, setYears] = useState(10);

  const futureValue = computeLumpsumFutureValue(principal, annualRate, years);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Lumpsum</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Principal" htmlFor="lumpsumPrincipal">
            <Input
              type="number"
              step="any"
              id="lumpsumPrincipal"
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Annual rate %" htmlFor="lumpsumRate">
            <Input
              type="number"
              step="any"
              id="lumpsumRate"
              value={annualRate}
              onChange={(e) => setAnnualRate(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Years" htmlFor="lumpsumYears">
            <Input
              type="number"
              step="any"
              id="lumpsumYears"
              value={years}
              onChange={(e) => setYears(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Future value</p>
          <p className="tabular-nums text-xl font-semibold">{money(futureValue)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
