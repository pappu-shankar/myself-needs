"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { kgToLb, lbToKg, roundTo } from "@/modules/health/engine/units";

function show(n: number): string {
  return String(roundTo(n, 2));
}

export function UnitConverter() {
  const [kg, setKg] = useState("100");
  const [lb, setLb] = useState(show(kgToLb(100)));

  function onKg(value: string) {
    setKg(value);
    const n = Number(value);
    setLb(value.trim() !== "" && Number.isFinite(n) ? show(kgToLb(n)) : "");
  }
  function onLb(value: string) {
    setLb(value);
    const n = Number(value);
    setKg(value.trim() !== "" && Number.isFinite(n) ? show(lbToKg(n)) : "");
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:max-w-md">
      <FormField label="Kilograms (kg)" htmlFor="convKg">
        <Input
          type="number"
          step="any"
          inputMode="decimal"
          value={kg}
          onChange={(e) => onKg(e.target.value)}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Pounds (lb)" htmlFor="convLb">
        <Input
          type="number"
          step="any"
          inputMode="decimal"
          value={lb}
          onChange={(e) => onLb(e.target.value)}
          className="tabular-nums"
        />
      </FormField>
    </div>
  );
}
