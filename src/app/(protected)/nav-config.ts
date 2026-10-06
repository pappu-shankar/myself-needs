import {
  LayoutDashboard,
  Wallet,
  HeartPulse,
  Brain,
  Target,
  Home,
  Shirt,
  Settings,
  Dumbbell,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
// Type-only: erased at build time, so this client-shared file never pulls in the registry.
import type { SpaceModule } from "@/modules/core/auth/spaces-store";

/**
 * `module` ties an item to a space module: inside a shared space, items whose
 * module the space hasn't enabled are hidden. Items without one (Dashboard,
 * Settings) always show.
 */
export const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/finance", label: "Finance", icon: Wallet, module: "finance" },
  {
    href: "/health",
    label: "Health",
    icon: HeartPulse,
    module: "health",
    // Desktop sidebar only — the mobile tab bar has no room for a ninth tab, so
    // on phones gym pages keep the Health tab active and use the gym section tabs.
    children: [{ href: "/health/gym", label: "Gym", icon: Dumbbell }],
  },
  { href: "/mental", label: "Mental", icon: Brain, module: "mental" },
  { href: "/plans", label: "Plans", icon: Target, module: "plans" },
  { href: "/house", label: "House", icon: Home, module: "house" },
  { href: "/fashion", label: "Fashion", icon: Shirt, module: "fashion" },
  { href: "/settings", label: "Settings", icon: Settings },
] as const satisfies readonly {
  href: string;
  label: string;
  icon: LucideIcon;
  module?: SpaceModule;
  children?: readonly { href: string; label: string; icon: LucideIcon }[];
}[];

export type NavItem = (typeof navItems)[number];

/** Desktop sidebar only (on phones it lives in the account menu). */
export const adminNavItem = { href: "/admin", label: "Admin", icon: ShieldCheck } as const;

/**
 * The nav items to show. `enabledModules` is null in the personal vault (every
 * module shows) and the space's module list inside a shared space.
 */
export function visibleNavItems(enabledModules: readonly SpaceModule[] | null): NavItem[] {
  if (enabledModules === null) return [...navItems];
  return navItems.filter((item) => !("module" in item) || enabledModules.includes(item.module));
}

/** The space module a pathname belongs to, if any (`/finance/tax` → "finance"). */
export function moduleOfPath(pathname: string): SpaceModule | undefined {
  for (const item of navItems) {
    if ("module" in item && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
      return item.module;
    }
  }
  return undefined;
}

/** The most specific nav href that prefixes `pathname` (so /health/gym/… is Gym, not Health). */
export function activeNavHref(pathname: string): string | undefined {
  return [...navItems, adminNavItem]
    .flatMap((item) =>
      ["children" in item ? item.children.map((c) => c.href) : [], item.href].flat(),
    )
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}
