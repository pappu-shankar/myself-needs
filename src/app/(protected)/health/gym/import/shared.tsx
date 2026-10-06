"use client";

import * as React from "react";

/** Native progress bar plus a polite live status line. */
export function ProgressStatus({
  label,
  value,
  max,
  status,
}: {
  label: string;
  value: number;
  max: number;
  status: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <progress aria-label={label} value={value} max={max} className="h-2 w-full accent-primary" />
      <p aria-live="polite" className="text-muted-foreground text-sm tabular-nums">
        {status}
      </p>
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}

/** Stat list used by previews and summaries. */
export function Stats({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3 text-sm">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Collapsible({ summary, items }: { summary: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">{summary}</summary>
      <ul className="text-muted-foreground mt-2 max-h-60 list-disc space-y-1 overflow-auto pl-5 break-words">
        {items.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

/** A summary region announced to assistive tech when it appears. */
export function SummaryBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="bg-muted/50 flex flex-col gap-3 rounded-lg p-3">
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}
