import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.ComponentProps<"div"> {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}

/** A real designed empty state — never bare "no data" text. See docs/design/components.md. */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border bg-card/50 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center",
        className,
      )}
      {...props}
    >
      <Icon className="text-muted-foreground size-8" aria-hidden="true" />
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
