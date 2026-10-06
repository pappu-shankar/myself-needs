import {
  Wallet,
  TrendingUp,
  CreditCard,
  Target,
  Receipt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * The finance information architecture, defined once.
 *
 * It used to be duplicated by hand across five places — the app nav config, the
 * breadcrumb label map, the finance hub's card grid, three sub-hub card lists,
 * and a "Back to…" link on every page. Adding a page meant editing all of them,
 * and they drifted: a page could be reachable from the hub with one title and
 * appear in the breadcrumb trail with another. This file is now the only source,
 * and everything else derives from it.
 *
 * It imports nothing but icons, deliberately: the breadcrumb bar and the
 * section nav are `"use client"` components, and anything reachable from a
 * client component must not transitively reach `db/client.ts` — that drags the
 * native SQLite binding into the browser bundle. See AGENTS.md.
 *
 * The six sections are a navigation *under* `finance/`, not new top-level tabs:
 * the app sidebar is full, and the mobile tab bar has no room for a ninth tab.
 * See docs/prd/finance/information-architecture.md.
 */

export interface FinancePage {
  /** Route, which is also the breadcrumb key. */
  href: string;
  /** Used for the nav item, the hub card and the breadcrumb label, so the three
   * cannot disagree. */
  title: string;
  /** Hub card copy. */
  description: string;
  /** Not yet built — shown in the nav as unavailable rather than linking to a
   * 404, and left out of the hub grid. Reserving the slot is what keeps the
   * section's shape honest while it fills in. */
  planned?: boolean;
}

export interface FinanceSection {
  id: string;
  /** Section label, upper-cased in the nav by CSS rather than in the data. */
  label: string;
  icon: LucideIcon;
  /** One line on the section hub saying what question the section answers. */
  summary: string;
  pages: readonly FinancePage[];
}

export const FINANCE_HOME = "/finance";

export const FINANCE_SECTIONS: readonly FinanceSection[] = [
  {
    id: "money",
    label: "Money",
    icon: Wallet,
    summary: "What comes in, what goes out, and what is sitting in the bank.",
    pages: [
      {
        href: "/finance/accounts",
        title: "Accounts",
        description: "Bank accounts, cards, loans, and other balances.",
      },
      {
        href: "/finance/transactions",
        title: "Transactions",
        description: "Income, expenses, and transfers.",
      },
      {
        href: "/finance/categories",
        title: "Categories",
        description: "Income and expense categories.",
      },
      {
        href: "/finance/budgets",
        title: "Budgets",
        description: "Monthly spending limits by category.",
      },
      {
        href: "/finance/recurring",
        title: "Recurring",
        description: "Recurring rules and unconfirmed occurrences.",
      },
      {
        href: "/finance/reports",
        title: "Reports",
        description: "Spending, income, and net worth charts.",
      },
    ],
  },
  {
    id: "wealth",
    label: "Wealth",
    icon: TrendingUp,
    summary: "Everything you own, what it is worth, and how it got there.",
    pages: [
      {
        href: "/finance/investments",
        title: "Investments",
        description: "Holdings and scheme reference rates.",
      },
      {
        href: "/finance/insurance",
        title: "Insurance",
        description: "Life, health, term, and vehicle policies.",
      },
    ],
  },
  {
    id: "debt",
    label: "Debt",
    icon: CreditCard,
    summary: "What you owe, at what rate, and what paying it down early buys you.",
    pages: [
      {
        href: "/finance/debts",
        title: "Debts",
        description: "Credit cards and loans, with amortization.",
      },
    ],
  },
  {
    id: "goals",
    label: "Goals",
    icon: Target,
    summary: "What the money is for, and whether it is on track to get there.",
    pages: [
      {
        href: "/finance/goals",
        title: "Goals",
        description: "Financial goals, funding, and progress.",
        planned: true,
      },
    ],
  },
  {
    id: "tax",
    label: "Tax",
    icon: Receipt,
    summary: "Estimates only — deductions, gains and regime choice, never filing.",
    pages: [
      {
        href: "/finance/tax",
        title: "Tax",
        description: "Deductions, regime comparison, and capital gains.",
      },
      {
        href: "/finance/calculators",
        title: "Calculators",
        description: "SIP, lumpsum, CAGR, XIRR, IRR, inflation, EMI.",
      },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: Sparkles,
    summary: "What needs attention, and what a decision would do to the rest.",
    pages: [
      {
        href: "/finance/insights",
        title: "Insights",
        description: "Audits, advice, and compliance nudges.",
      },
      {
        href: "/finance/settings",
        title: "Settings",
        description: "Tax policy, allocation targets, and insight thresholds.",
      },
    ],
  },
];

/** Every page across every section, built once. */
export const FINANCE_PAGES: readonly FinancePage[] = FINANCE_SECTIONS.flatMap((section) => [
  ...section.pages,
]);

/** Pages that actually exist — the hub grid and the breadcrumb trail only ever
 * want these. */
export const FINANCE_BUILT_PAGES: readonly FinancePage[] = FINANCE_PAGES.filter((p) => !p.planned);

/**
 * Breadcrumb labels for every finance route, keyed by the last path segment.
 *
 * Derived rather than hand-listed, which is the point: a page added to a
 * section gets its breadcrumb label for free, with the same wording as its nav
 * item. Deeper segments that are not pages of their own (`holdings`,
 * `deductions`) stay in the breadcrumb map's own table.
 */
export const FINANCE_SEGMENT_LABELS: Record<string, string> = Object.fromEntries(
  FINANCE_PAGES.map((page) => [page.href.split("/").pop()!, page.title]),
);

/** The section a route belongs to, for the section nav's active state and for
 * the "Back to <section>" link that replaced the per-page hardcoded ones. */
export function sectionOfPath(pathname: string): FinanceSection | undefined {
  // Longest href first, so `/finance/investments/holdings` resolves to the
  // Investments page's section rather than to a shorter accidental prefix.
  const match = [...FINANCE_PAGES]
    .filter((p) => pathname === p.href || pathname.startsWith(`${p.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return undefined;
  return FINANCE_SECTIONS.find((s) => s.pages.some((p) => p.href === match.href));
}

/** The page a route belongs to, for a nav item's active state. */
export function pageOfPath(pathname: string): FinancePage | undefined {
  return [...FINANCE_PAGES]
    .filter((p) => pathname === p.href || pathname.startsWith(`${p.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
