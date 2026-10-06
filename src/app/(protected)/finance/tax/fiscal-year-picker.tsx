import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * FY switcher as plain links (`?fy=2025-26`) — works without client JS and
 * keeps the chosen FY in the URL so it survives refreshes and can be bookmarked.
 */
export function FiscalYearPicker({
  basePath,
  years,
  selected,
  current,
}: {
  basePath: string;
  /** FY labels, newest first. */
  years: string[];
  selected: string;
  current: string;
}) {
  return (
    <nav aria-label="Financial year" className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">Financial year:</span>
      {years.map((fy) => (
        <Button
          key={fy}
          size="sm"
          variant={fy === selected ? "default" : "outline"}
          nativeButton={false}
          aria-current={fy === selected ? "page" : undefined}
          render={<Link href={`${basePath}?fy=${fy}`} />}
        >
          FY {fy}
          {fy === current ? " (current)" : ""}
        </Button>
      ))}
    </nav>
  );
}
