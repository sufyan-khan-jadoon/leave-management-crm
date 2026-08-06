import { CalendarDays, KeyRound, LayoutDashboard, Sparkles, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ROUTES } from "@/lib/constants";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Matches nested routes, e.g. /leaves/new highlights "Leave history". */
  exact?: boolean;
  /**
   * Heading this item sits under. Rendered once, above the first item carrying
   * it. Employees have a single flat list and set none.
   */
  group?: string;
};

export const EMPLOYEE_NAV: NavItem[] = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: ROUTES.newLeave, label: "Request leave", icon: Sparkles, exact: true },
  { href: ROUTES.leaves, label: "Leave history", icon: CalendarDays, exact: true },
  { href: ROUTES.profile, label: "My profile", icon: User, exact: true },
];

/**
 * Administrators get two groups: what they manage, and their own leave.
 *
 * The personal half is not a courtesy — an administrator draws the same monthly
 * allowance as anyone else, so they need somewhere to see the balance and book
 * against it. It points at the same employee screens rather than duplicating
 * them, since the underlying services are keyed by employee id, not by role.
 */
export const ADMIN_NAV: NavItem[] = [
  { href: ROUTES.adminDashboard, label: "Overview", icon: LayoutDashboard, exact: true, group: "Manage" },
  { href: ROUTES.adminEmployees, label: "Employees", icon: Users, group: "Manage" },
  { href: ROUTES.adminLeaves, label: "Leave requests", icon: CalendarDays, group: "Manage" },

  { href: ROUTES.dashboard, label: "My leave", icon: LayoutDashboard, exact: true, group: "Personal" },
  { href: ROUTES.newLeave, label: "Request leave", icon: Sparkles, exact: true, group: "Personal" },
  { href: ROUTES.leaves, label: "My history", icon: CalendarDays, exact: true, group: "Personal" },
  { href: ROUTES.profile, label: "My profile", icon: User, exact: true, group: "Personal" },
];

/**
 * The access panel belongs to the super admin alone: it is the only place
 * administrator keys are issued and invite permissions are granted. Admins
 * invite employees from the Employees screen instead, once allowed to.
 */
// Splits on "not personal" rather than on "is manage", so an item added to
// ADMIN_NAV without a group still reaches the super admin instead of silently
// vanishing from their sidebar.
export const SUPER_ADMIN_NAV: NavItem[] = [
  ...ADMIN_NAV.filter((item) => item.group !== "Personal"),
  { href: ROUTES.adminAccess, label: "Access keys", icon: KeyRound, group: "Manage" },
  ...ADMIN_NAV.filter((item) => item.group === "Personal"),
];

export function isActiveRoute(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
