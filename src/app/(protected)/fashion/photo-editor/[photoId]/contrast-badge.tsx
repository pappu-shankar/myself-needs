import type { ContrastVerdict } from "@/modules/fashion/types";
import { cn } from "@/lib/utils";

const LABELS: Record<ContrastVerdict, string> = {
  pops: "Pops",
  washed_out: "Washed out",
  neutral: "Neutral",
};

const STYLES: Record<ContrastVerdict, string> = {
  pops: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  washed_out: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  neutral: "bg-muted text-muted-foreground",
};

export function ContrastBadge({ verdict }: { verdict: ContrastVerdict }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STYLES[verdict])}>
      {LABELS[verdict]}
    </span>
  );
}
