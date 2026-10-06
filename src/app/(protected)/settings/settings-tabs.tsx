"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/password", label: "Password & recovery" },
  { href: "/settings/devices", label: "Devices" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/account", label: "Danger zone" },
] as const;

/** Section tabs for /settings/*. Scrolls sideways on narrow screens. */
export function SettingsTabs({ alertCount }: { alertCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {SETTINGS_SECTIONS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {label}
                {href === "/settings/security" && alertCount > 0 && (
                  <span className="bg-destructive/10 text-destructive rounded-full px-1.5 text-xs font-medium">
                    {alertCount}
                    <span className="sr-only"> unread alerts</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
