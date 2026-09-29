import {
  LayoutDashboard,
  Wallet,
  HeartPulse,
  Brain,
  Target,
  Home,
  Shirt,
  Settings,
} from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/health", label: "Health", icon: HeartPulse },
  { href: "/mental", label: "Mental", icon: Brain },
  { href: "/plans", label: "Plans", icon: Target },
  { href: "/house", label: "House", icon: Home },
  { href: "/fashion", label: "Fashion", icon: Shirt },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
