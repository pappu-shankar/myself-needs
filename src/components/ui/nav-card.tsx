import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavCardProps extends React.ComponentProps<typeof Link> {
  title: string;
  description?: string;
}

/** A single row in a list of links to sub-pages — see e.g. the Finance hub's section list. */
function NavCard({ title, description, className, ...props }: NavCardProps) {
  return (
    <Link
      data-slot="nav-card"
      className={cn(
        "group flex items-center justify-between gap-4 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10 transition-colors hover:bg-muted",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{description}</p>
        )}
      </div>
      <ChevronRight
        className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export { NavCard };
