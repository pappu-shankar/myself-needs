"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FINANCE_HOME, FINANCE_SECTIONS, pageOfPath, sectionOfPath } from "./ia-config";

/**
 * The finance section navigation — MONEY / WEALTH / DEBT / GOALS / TAX /
 * INTELLIGENCE — plus the pages of whichever section is open.
 *
 * Two rows rather than a flat list of every page: the module has ~14 pages, and
 * a flat list of fourteen is a list nobody reads. Entirely derived from
 * `ia-config.ts`, so a new page appears here, in the breadcrumb trail and on
 * the hub from one edit.
 */
export function FinanceSectionNav() {
  const pathname = usePathname();
  const activeSection = sectionOfPath(pathname);
  const activePage = pageOfPath(pathname);

  return (
    <nav aria-label="Finance sections" className="mb-6 flex flex-col gap-2">
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <Link
            href={FINANCE_HOME}
            aria-current={pathname === FINANCE_HOME ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-3 text-sm transition-colors",
              pathname === FINANCE_HOME
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            Overview
          </Link>
        </li>
        {FINANCE_SECTIONS.map((section) => {
          const isActive = activeSection?.id === section.id;
          // A section links to its first built page: a section is a grouping,
          // not a route, so there is nothing at `/finance/money` to land on.
          const target = section.pages.find((p) => !p.planned);
          const Icon = section.icon;
          return (
            <li key={section.id}>
              {target ? (
                <Link
                  href={target.href}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {section.label}
                </Link>
              ) : (
                <span
                  className="text-muted-foreground/60 inline-flex h-8 cursor-default items-center gap-1.5 px-3 text-sm"
                  title="Not built yet"
                >
                  <Icon aria-hidden className="size-3.5" />
                  {section.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {activeSection && activeSection.pages.length > 1 && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-1">
          {activeSection.pages.map((page) =>
            page.planned ? (
              <li
                key={page.href}
                className="text-muted-foreground/60 text-xs"
                title="Not built yet"
              >
                {page.title}
              </li>
            ) : (
              <li key={page.href}>
                <Link
                  href={page.href}
                  aria-current={activePage?.href === page.href ? "page" : undefined}
                  className={cn(
                    "text-xs underline-offset-4 transition-colors hover:underline",
                    activePage?.href === page.href
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {page.title}
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </nav>
  );
}
