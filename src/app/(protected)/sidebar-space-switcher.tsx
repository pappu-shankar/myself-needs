"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Settings2, UserRound, Users } from "lucide-react";
import { switchVaultAction } from "@/modules/core/spaces/actions";
import type { SpaceModule, SpaceRole } from "@/modules/core/auth/spaces-store";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { moduleOfPath } from "./nav-config";
import { ROLE_LABELS } from "./spaces/space-labels";

export interface SwitcherSpace {
  id: string;
  name: string;
  role: SpaceRole;
  modules: SpaceModule[];
  active: boolean;
}

const PERSONAL = "personal";

/**
 * Picks which vault the app shows: the user's own ("Personal") or one of their
 * shared spaces. The choice lives in the session, so switching is a Server
 * Action followed by a refresh. If the current page belongs to a module the
 * target space doesn't use, it goes to the dashboard instead.
 */
export function SpaceSwitcher({
  spaces,
  compact = false,
}: {
  spaces: SwitcherSpace[];
  /** Mobile top bar: a narrower trigger. */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = spaces.find((s) => s.active) ?? null;
  const value = active ? active.id : PERSONAL;
  const currentName = active ? active.name : "Personal";

  function switchTo(next: string) {
    if (next === value) return;
    const target = spaces.find((s) => s.id === next) ?? null;
    setError(null);
    startTransition(async () => {
      const result = await switchVaultAction(
        target ? { kind: "space", id: target.id } : { kind: "user" },
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      const pageModule = moduleOfPath(pathname);
      if (target && pageModule && !target.modules.includes(pageModule)) {
        router.push("/dashboard");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Switch space (current: ${currentName})`}
          disabled={isPending}
          className={cn(
            "hover:bg-sidebar-accent/60 focus-visible:ring-sidebar-ring flex min-w-0 items-center gap-2 rounded-md text-left text-sm transition-colors outline-none focus-visible:ring-2 disabled:opacity-60",
            compact ? "max-w-44 px-2 py-1.5" : "w-full border px-2.5 py-2",
          )}
        >
          {active ? (
            <Users className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {isPending ? "Switching…" : currentName}
          </span>
          {active && !compact && (
            <Badge variant="secondary" className="shrink-0">
              {ROLE_LABELS[active.role]}
            </Badge>
          )}
          <ChevronsUpDown
            className="text-sidebar-foreground/60 size-3.5 shrink-0"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Show data from</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => switchTo(v)}>
              <DropdownMenuRadioItem value={PERSONAL} closeOnClick>
                <UserRound aria-hidden="true" />
                <span className="flex-1">Personal</span>
              </DropdownMenuRadioItem>
              {spaces.map((space) => (
                <DropdownMenuRadioItem
                  key={space.id}
                  value={space.id}
                  closeOnClick
                  label={space.name}
                >
                  <Users aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{space.name}</span>
                  <Badge variant="outline" className="shrink-0">
                    {ROLE_LABELS[space.role]}
                  </Badge>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/spaces")}>
            <Settings2 aria-hidden="true" />
            Manage spaces
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/spaces#new-space")}>
            <Plus aria-hidden="true" />
            New space
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="text-destructive px-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
