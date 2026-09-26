"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A curated palette spanning the room/opening/furniture default colors already used in the house viewer, plus a few neutrals — not exhaustive, just a fast starting point before typing a custom hex. */
const SWATCHES = [
  "#c9ada7",
  "#a2d2ff",
  "#ffd6a5",
  "#caffbf",
  "#fdffb6",
  "#e0e0e0",
  "#bdbdbd",
  "#b8e0d2",
  "#8d5a3b",
  "#7fd8f0",
  "#e8c1a0",
  "#8a7e72",
  "#a47551",
  "#6f5a44",
  "#54402e",
  "#333333",
];

/**
 * A hex-swatch grid plus a free-text hex input, submitting as a plain named
 * form field (this app's forms are native `<form action={formAction}>` +
 * FormData, not a controlled form library — see room-form.tsx). Designed to
 * work as `FormField`'s child: `FormField` clones its child element with
 * `id`/`aria-describedby`/`aria-invalid`, which land here as props and get
 * forwarded onto the actual text input.
 */
export function ColorSwatchPicker({
  name,
  id,
  defaultValue,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Color swatches">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={value.toLowerCase() === hex}
            onClick={() => setValue(hex)}
            className={cn(
              "border-input size-6 rounded-full border transition-shadow",
              value.toLowerCase() === hex &&
                "ring-ring ring-offset-background ring-2 ring-offset-1",
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <Input
        type="text"
        id={inputId}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        placeholder="#d4a373"
        className="w-32"
      />
    </div>
  );
}
