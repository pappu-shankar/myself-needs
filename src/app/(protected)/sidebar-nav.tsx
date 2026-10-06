"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import type { SpaceModule } from "@/modules/core/auth/spaces-store";
import { cn } from "@/lib/utils";
import { activeNavHref, adminNavItem, visibleNavItems } from "./nav-config";
import { SearchPalette } from "./search-palette";
import { AccountMenu, AlertsBell } from "./sidebar-account-menu";
import type { AvatarUser } from "./sidebar-avatar";
import { SpaceSwitcher, type SwitcherSpace } from "./sidebar-space-switcher";

export interface SidebarNavProps {
  user: AvatarUser;
  isAdmin: boolean;
  spaces: SwitcherSpace[];
  /** The active space's modules, or null in the personal vault (everything shows). */
  enabledModules: SpaceModule[] | null;
  alertCount: number;
}

export function SidebarNav({ user, isAdmin, spaces, enabledModules, alertCount }: SidebarNavProps) {
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const items = visibleNavItems(enabledModules);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80",
    );

  return (
    <>
      {/* Mobile top bar: space switcher + search + alerts + account. Full sidebar below is desktop-only. */}
      <header className="border-sidebar-border bg-sidebar text-sidebar-foreground flex shrink-0 items-center justify-between gap-2 border-b p-2 sm:hidden">
        <SpaceSwitcher spaces={spaces} compact />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="hover:bg-sidebar-accent/60 text-sidebar-foreground/70 flex size-9 items-center justify-center rounded-md transition-colors"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
          <AlertsBell count={alertCount} />
          <AccountMenu user={user} isAdmin={isAdmin} compact />
        </div>
      </header>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Desktop sidebar */}
      <nav
        aria-label="Main"
        className="border-sidebar-border bg-sidebar text-sidebar-foreground hidden h-full w-56 shrink-0 flex-col border-r p-4 sm:flex"
      >
        <span className="px-2 pb-4 text-sm font-semibold tracking-tight">Personal Life OS</span>
        <div className="mb-3">
          <SpaceSwitcher spaces={spaces} />
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hover:bg-sidebar-accent/60 text-sidebar-foreground/70 mb-4 flex items-center justify-between gap-2.5 rounded-md border px-2.5 py-2 text-sm transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <Search className="size-4" aria-hidden="true" />
            Search
          </span>
          <kbd className="text-sidebar-foreground/50 text-xs">⌘K</kbd>
        </button>
        <ul className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const { href, label, icon: Icon } = item;
            const active = activeHref === href;
            const children = "children" in item ? item.children : [];
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={linkClass(active)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
                {children.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1">
                    {children.map(({ href: childHref, label: childLabel, icon: ChildIcon }) => {
                      const childActive = activeHref === childHref;
                      return (
                        <li key={childHref}>
                          <Link
                            href={childHref}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md py-1.5 pr-2.5 pl-8 text-sm transition-colors",
                              childActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                : "hover:bg-sidebar-accent/60 text-sidebar-foreground/70",
                            )}
                            aria-current={childActive ? "page" : undefined}
                          >
                            <ChildIcon className="size-3.5" aria-hidden="true" />
                            {childLabel}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {isAdmin && (
            <li>
              <Link
                href={adminNavItem.href}
                className={linkClass(activeHref === adminNavItem.href)}
                aria-current={activeHref === adminNavItem.href ? "page" : undefined}
              >
                <adminNavItem.icon className="size-4" aria-hidden="true" />
                {adminNavItem.label}
              </Link>
            </li>
          )}
        </ul>
        <div className="border-sidebar-border flex items-center gap-1 border-t pt-3">
          <div className="min-w-0 flex-1">
            <AccountMenu user={user} isAdmin={isAdmin} />
          </div>
          <AlertsBell count={alertCount} />
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="border-sidebar-border bg-sidebar fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {items.map(({ href, label, icon: Icon }) => {
          // A child route (e.g. Gym) keeps its parent tab active on mobile.
          const active =
            activeHref !== undefined && (activeHref === href || activeHref.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
                active
                  ? "text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
