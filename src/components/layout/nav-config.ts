import { CalendarDays, LayoutDashboard, Sparkles, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ROUTES } from "@/lib/constants";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Matches nested routes, e.g. /leaves/new highlights "Leave history". */
  exact?: boolean;
};

export const EMPLOYEE_NAV: NavItem[] = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: ROUTES.newLeave, label: "Request leave", icon: Sparkles, exact: true },
  { href: ROUTES.leaves, label: "Leave history", icon: CalendarDays, exact: true },
  { href: ROUTES.profile, label: "My profile", icon: User, exact: true },
];

export const ADMIN_NAV: NavItem[] = [
  { href: ROUTES.adminDashboard, label: "Overview", icon: LayoutDashboard, exact: true },
  { href: ROUTES.adminEmployees, label: "Employees", icon: Users },
  { href: ROUTES.adminLeaves, label: "Leave requests", icon: CalendarDays },
];

export function isActiveRoute(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
