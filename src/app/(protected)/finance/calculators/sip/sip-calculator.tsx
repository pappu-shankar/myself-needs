"use client";

import { useState } from "react";
import { computeSipFutureValue } from "@/modules/finance/service/utility/returns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SipCalculator() {
  const [monthlyAmount, setMonthlyAmount] = useState(10000);
  const [annualRate, setAnnualRate] = useState(12);
  const [years, setYears] = useState(10);

  const result = computeSipFutureValue(monthlyAmount, annualRate, years);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">SIP</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Systematic investment plan — a fixed amount invested every month.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Monthly amount" htmlFor="sipMonthly">
            <Input
              type="number"
              step="any"
              id="sipMonthly"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Expected annual rate %" htmlFor="sipRate">
            <Input
              type="number"
              step="any"
              id="sipRate"
              value={annualRate}
              onChange={(e) => setAnnualRate(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Years" htmlFor="sipYears">
            <Input
              type="number"
              step="any"
              id="sipYears"
              value={years}
              onChange={(e) => setYears(Number(e.target.value) || 0)}
              className="tabular-nums"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-sm">Future value</p>
            <p className="tabular-nums text-xl font-semibold">{formatAmount(result.futureValue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Total invested</p>
            <p className="tabular-nums text-xl font-semibold">
              {formatAmount(result.totalInvested)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Total gain</p>
            <p className="tabular-nums text-xl font-semibold">{formatAmount(result.totalGain)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
