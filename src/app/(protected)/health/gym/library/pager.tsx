import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Previous / next links with a "51–100 of 120" label. Plain links, so it works without JS. */
export function Pager({
  label,
  from,
  to,
  total,
  prevHref,
  nextHref,
}: {
  label: string;
  from: number;
  to: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const disabled = "pointer-events-none opacity-50";
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground tabular-nums">
        {total === 0 ? "0 results" : `${from}–${to} of ${total}`}
      </p>
      <div className="flex gap-2">
        {prevHref ? (
          <Link href={prevHref} rel="prev" className={buttonVariants({ variant: "outline" })}>
            Previous
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={cn(buttonVariants({ variant: "outline" }), disabled)}
          >
            Previous
          </span>
        )}
        {nextHref ? (
          <Link href={nextHref} rel="next" className={buttonVariants({ variant: "outline" })}>
            Next
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={cn(buttonVariants({ variant: "outline" }), disabled)}
          >
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
