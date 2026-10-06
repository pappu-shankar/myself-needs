"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info, ShieldAlert } from "lucide-react";
import { dismissAlertAction } from "@/modules/core/auth/account-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AlertRow {
  id: string;
  severity: "info" | "warning";
  title: string;
  message: string;
  when: string;
}

function AlertItem({ alert, onDismissed }: { alert: AlertRow; onDismissed: (id: string) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const Icon = alert.severity === "warning" ? ShieldAlert : Info;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between",
        alert.severity === "warning" && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex min-w-0 gap-3">
        <Icon
          className={cn(
            "mt-0.5 size-5 shrink-0",
            alert.severity === "warning" ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {alert.severity === "warning" && <span className="sr-only">Warning: </span>}
            {alert.title}
          </p>
          <p className="text-muted-foreground text-sm">{alert.message}</p>
          <p className="text-muted-foreground text-xs">{alert.when}</p>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="self-start"
        disabled={isPending}
        aria-label={`Dismiss "${alert.title}"`}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await dismissAlertAction({ alertId: alert.id });
            if (result.error) {
              setError(result.error);
              return;
            }
            onDismissed(alert.id);
            router.refresh();
          });
        }}
      >
        {isPending ? "Dismissing…" : "Dismiss"}
      </Button>
    </li>
  );
}

export function AlertList({ alerts }: { alerts: AlertRow[] }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        No security alerts. You&apos;ll see one here after a sign-in from a new device, several
        wrong-password attempts, a recovery-key reset, or an admin changing your account.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {visible.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onDismissed={(id) => setDismissed((prev) => new Set(prev).add(id))}
        />
      ))}
    </ul>
  );
}
