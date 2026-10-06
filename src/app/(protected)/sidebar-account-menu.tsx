"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronsUpDown, LogOut, MonitorX, Settings, ShieldCheck, Users } from "lucide-react";
import { signOutAction, signOutEverywhereAction } from "@/modules/core/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { displayNameOf, UserAvatar, type AvatarUser } from "./sidebar-avatar";

/** Bell linking to Settings → Security, with the unread alert count. */
export function AlertsBell({ count, className }: { count: number; className?: string }) {
  const label = count === 0 ? "Security alerts (none)" : `Security alerts (${count} unread)`;
  return (
    <Link
      href="/settings/security"
      aria-label={label}
      title={label}
      className={cn(
        "hover:bg-sidebar-accent/60 text-sidebar-foreground/70 focus-visible:ring-sidebar-ring relative flex size-9 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2",
        className,
      )}
    >
      <Bell className="size-4" aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="bg-destructive absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-none font-semibold text-white"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

/**
 * The signed-in user's avatar + name, opening a menu with settings, spaces,
 * admin (for admins) and the sign-out options. `compact` shows only the
 * avatar (mobile top bar).
 */
export function AccountMenu({
  user,
  isAdmin,
  compact = false,
}: {
  user: AvatarUser;
  isAdmin: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const name = displayNameOf(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        disabled={isPending}
        className={cn(
          "hover:bg-sidebar-accent/60 focus-visible:ring-sidebar-ring flex min-w-0 items-center gap-2.5 rounded-md text-left text-sm transition-colors outline-none focus-visible:ring-2 disabled:opacity-60",
          compact ? "size-9 justify-center" : "w-full px-2 py-1.5",
        )}
      >
        <UserAvatar user={user} size={compact ? "sm" : "md"} />
        {!compact && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{name}</span>
              {name !== user.username && (
                <span className="text-sidebar-foreground/60 truncate text-xs">
                  @{user.username}
                </span>
              )}
            </span>
            <ChevronsUpDown
              className="text-sidebar-foreground/60 size-3.5 shrink-0"
              aria-hidden="true"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" side={compact ? "bottom" : "top"} align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Signed in as <span className="text-foreground">{user.username}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings aria-hidden="true" />
            Profile &amp; settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/spaces")}>
            <Users aria-hidden="true" />
            Spaces
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem onClick={() => router.push("/admin")}>
              <ShieldCheck aria-hidden="true" />
              Admin
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => startTransition(() => signOutAction())}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => startTransition(() => signOutEverywhereAction())}
        >
          <MonitorX aria-hidden="true" />
          Sign out everywhere
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
