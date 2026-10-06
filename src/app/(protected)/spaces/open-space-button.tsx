"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchVaultAction } from "@/modules/core/spaces/actions";
import { Button } from "@/components/ui/button";

/** Switches the app to this space (or back to Personal) and goes to the dashboard. */
export function OpenSpaceButton({
  spaceId,
  name,
  active,
}: {
  spaceId: string;
  name: string;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant={active ? "ghost" : "default"}
        disabled={isPending}
        aria-label={active ? `Back to Personal (leave ${name} view)` : `Open ${name}`}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await switchVaultAction(
              active ? { kind: "user" } : { kind: "space", id: spaceId },
            );
            if (result.error) {
              setError(result.error);
              return;
            }
            router.push("/dashboard");
            router.refresh();
          });
        }}
      >
        {isPending ? "Switching…" : active ? "Back to Personal" : "Open"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
