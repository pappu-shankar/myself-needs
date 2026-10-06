"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const GYM_SECTIONS = [
  { href: "/health/gym", label: "Overview" },
  { href: "/health/gym/workout", label: "Workout" },
  { href: "/health/gym/history", label: "History" },
  { href: "/health/gym/routines", label: "Routines" },
  { href: "/health/gym/plan", label: "Plan" },
  { href: "/health/gym/programs", label: "Programs" },
  { href: "/health/gym/library", label: "Exercises" },
  { href: "/health/gym/stats", label: "Stats" },
  { href: "/health/gym/body", label: "Body" },
  { href: "/health/gym/tools", label: "Tools" },
  { href: "/health/gym/camera", label: "Camera" },
  { href: "/health/gym/import", label: "Import" },
  { href: "/health/gym/settings", label: "Settings" },
] as const;

/** The longest section href that prefixes the path — so /health/gym/library/12 marks "Exercises", not "Overview". */
function activeHref(pathname: string): string | undefined {
  return GYM_SECTIONS.map((s) => s.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/** Section tabs shared by every gym page; scrolls sideways on narrow screens instead of wrapping. */
export function GymNav() {
  const active = activeHref(usePathname());
  return (
    <nav aria-label="Gym sections" className="-mx-1 mb-6 overflow-x-auto pb-1">
      <ul className="flex w-max gap-1 px-1">
        {GYM_SECTIONS.map(({ href, label }) => {
          const current = href === active;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                  current
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
