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
import { FINANCE_SEGMENT_LABELS } from "./finance/ia-config";

/** One entry per route segment across the whole app — not every segment maps 1:1 to a page.tsx (e.g. "finance" is both a segment and a page), but every segment used as a URL path piece needs a label here. Falls back to a title-cased version of the raw segment for anything missed. */
/**
 * Labels for path segments that are not finance pages.
 *
 * Finance's own page labels come from `finance/ia-config.ts` and are merged in
 * below, so a finance page's breadcrumb and its nav item cannot disagree — they
 * are the same string. Only segments that are *not* pages of their own
 * (`holdings`, `deductions`, a calculator) are listed here.
 */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  finance: "Finance",
  health: "Health",
  mental: "Mental",
  plans: "Plans",

  holdings: "Holdings",
  "scheme-templates": "Scheme templates",
  tax: "Tax planning",
  deductions: "Deductions",
  "regime-comparison": "Regime comparison",
  "capital-gains": "Capital gains",
  settings: "Settings",

  calculators: "Calculators",
  sip: "SIP calculator",
  lumpsum: "Lumpsum calculator",
  cagr: "CAGR calculator",
  xirr: "XIRR calculator",
  irr: "IRR calculator",
  inflation: "Inflation calculator",
  emi: "EMI calculator",

  gym: "Gym",
  workout: "Workout",
  history: "History",
  routines: "Routines",
  plan: "Weekly plan",
  programs: "Programs",
  library: "Exercises",
  stats: "Stats",
  body: "Body",
  tools: "Tools",
  camera: "Camera rep counter",
  import: "Import & export",

  admin: "Admin",
  users: "Users",
  invites: "Invites",
  spaces: "Spaces",
  devices: "Devices",
  security: "Security",
  password: "Password",
  account: "Account",
};

/** What an id segment (numeric or UUID) is, named after the collection it sits under. */
const ID_LABELS: Record<string, string> = {
  routines: "Routine",
  history: "Workout",
  library: "Exercise",
  "photo-editor": "Photo",
  spaces: "Space",
  users: "User",
  invites: "Invite",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function labelFor(segment: string, parent: string | undefined, inFinance: boolean): string {
  if (/^\d+$/.test(segment) || UUID.test(segment)) {
    return (parent && ID_LABELS[parent]) ?? "Details";
  }
  // The finance labels are consulted only under `/finance`. Looking them up by
  // bare segment everywhere would let `settings` on the app's own settings page
  // pick up finance's wording — the map is keyed by segment, not by route.
  return (
    (inFinance ? FINANCE_SEGMENT_LABELS[segment] : undefined) ??
    SEGMENT_LABELS[segment] ??
    segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Derives the trail from the URL itself rather than per-page props, so every route under `(protected)` gets one automatically — see the shared layout. */
export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const inFinance = segments[0] === "finance";
  const crumbs = segments.map((segment, i) => ({
    label: labelFor(segment, segments[i - 1], inFinance),
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
