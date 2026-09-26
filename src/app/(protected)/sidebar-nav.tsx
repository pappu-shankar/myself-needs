"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Search } from "lucide-react";
import { navItems } from "./nav-config";
import { lockAction } from "@/modules/core/session/actions";
import { SearchPalette } from "./search-palette";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
    <>
      {/* Mobile top bar: branding + search + lock. Full sidebar below is desktop-only. */}
      <div className="border-sidebar-border bg-sidebar text-sidebar-foreground flex shrink-0 items-center justify-between border-b p-3 sm:hidden">
        <span className="text-sm font-semibold tracking-tight">Personal Life OS</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="hover:bg-sidebar-accent/60 text-sidebar-foreground/70 flex size-9 items-center justify-center rounded-md transition-colors"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
          <form action={lockAction}>
            <button
              type="submit"
              aria-label="Lock"
              className="hover:bg-sidebar-accent/60 text-sidebar-foreground/70 flex size-9 items-center justify-center rounded-md transition-colors"
            >
              <Lock className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Desktop sidebar */}
      <nav className="border-sidebar-border bg-sidebar text-sidebar-foreground hidden h-full w-56 shrink-0 flex-col border-r p-4 sm:flex">
        <span className="px-2 pb-6 text-sm font-semibold tracking-tight">Personal Life OS</span>
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
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <form action={lockAction}>
          <button
            type="submit"
            className="hover:bg-sidebar-accent/60 text-sidebar-foreground/70 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors"
          >
            <Lock className="size-4" aria-hidden="true" />
            Lock
          </button>
        </form>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="border-sidebar-border bg-sidebar fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
                active
                  ? "text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
