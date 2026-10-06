import type * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The centred card every public auth page renders in. The title is the page's
 * one `<h1>`. Fits a 360 px viewport (16 px gutters, full-width card).
 */
export function AuthCard({
  title,
  description,
  footer,
  wide = false,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Secondary links under the card (e.g. "Back to sign in"). */
  footer?: React.ReactNode;
  /** A little more room for explanatory pages. */
  wide?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 py-8">
      <Card className={cn("w-full", wide ? "max-w-md" : "max-w-sm")}>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {children && <CardContent>{children}</CardContent>}
      </Card>
      {footer && (
        <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
          {footer}
        </div>
      )}
    </main>
  );
}
