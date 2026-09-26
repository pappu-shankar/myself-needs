"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** One entry per route segment across the whole app — not every segment maps 1:1 to a page.tsx (e.g. "finance" is both a segment and a page), but every segment used as a URL path piece needs a label here. Falls back to a title-cased version of the raw segment for anything missed. */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  finance: "Finance",
  health: "Health",
  mental: "Mental",
  plans: "Plans",

  accounts: "Accounts",
  categories: "Categories",
  transactions: "Transactions",
  budgets: "Budgets",
  recurring: "Recurring",
  insurance: "Insurance",
  debts: "Debts",
  investments: "Investments",
  holdings: "Holdings",
  "scheme-templates": "Scheme templates",
  reports: "Reports",
  tax: "Tax planning",
  deductions: "Deductions",
  "regime-comparison": "Regime comparison",
  "capital-gains": "Capital gains",
  settings: "Settings",
  insights: "Insights",

  calculators: "Calculators",
  sip: "SIP calculator",
  lumpsum: "Lumpsum calculator",
  cagr: "CAGR calculator",
  xirr: "XIRR calculator",
  irr: "IRR calculator",
  inflation: "Inflation calculator",
  emi: "EMI calculator",
};

function labelFor(segment: string): string {
  return (
    SEGMENT_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Derives the trail from the URL itself rather than per-page props, so every route under `(protected)` gets one automatically — see the shared layout. */
export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, i) => ({
    label: labelFor(segment),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }));

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
