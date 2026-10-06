import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning";
}

/** One labelled figure on the admin overview. Presentational only. */
export function StatTile({ label, value, hint, tone = "default" }: StatTileProps) {
  return (
    <div className="rounded-xl border p-4">
      <dl>
        <dt className="text-muted-foreground text-sm">{label}</dt>
        <dd
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tone === "warning" && "text-destructive",
          )}
        >
          {value}
        </dd>
      </dl>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}
