import {
  BotMessageSquare,
  CalendarDays,
  CalendarOff,
  Mail,
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from "lucide-react";
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
  { href: ROUTES.attendance, label: "Attendance", icon: MapPin, exact: true },
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
  // One name for one screen. It lists employees for an administrator and both
  // populations for the super admin, but which rows you are shown is a
  // permission, not a different place to be.
  { href: ROUTES.adminStaff, label: "Staff", icon: Users, group: "Manage" },
  { href: ROUTES.adminAttendance, label: "Attendance", icon: MapPin, group: "Manage" },
  // Both admin roles, sitting under Manage rather than Personal: it answers
  // about the workforce, not about the administrator asking. The employee
  // assistant under Personal is a different thing entirely — that one books
  // their own leave and knows nothing about anybody else.
  { href: ROUTES.adminAssistant, label: "Assistant", icon: BotMessageSquare, group: "Manage" },
  { href: ROUTES.adminLeaves, label: "Leave requests", icon: CalendarDays, group: "Manage" },
  // Shown to every administrator, not only those allowed to change it: which
  // days the organisation works decides what everybody's leave costs, and the
  // screen is read-only without the grant.
  { href: ROUTES.adminWorkingDays, label: "Working days", icon: CalendarOff, group: "Manage" },
  // Shown to every administrator. Whether they may actually send is granted per
  // account, and the screen says so rather than vanishing from the sidebar.
  { href: ROUTES.adminEmails, label: "Send email", icon: Mail, group: "Manage" },

  { href: ROUTES.dashboard, label: "My leave", icon: LayoutDashboard, exact: true, group: "Personal" },
  // Administrators turn up to the office like everybody else, so they mark
  // attendance on the same screen rather than a second one built for them.
  { href: ROUTES.attendance, label: "My attendance", icon: MapPin, exact: true, group: "Personal" },
  { href: ROUTES.newLeave, label: "Request leave", icon: Sparkles, exact: true, group: "Personal" },
  { href: ROUTES.leaves, label: "My history", icon: CalendarDays, exact: true, group: "Personal" },
  { href: ROUTES.profile, label: "My profile", icon: User, exact: true, group: "Personal" },
];

/**
 * The access panel belongs to the super admin alone: it is where administrator
 * requests are decided and every per-administrator grant is handed out or taken
 * back. Inviting is not there — every administrator who may onboard anybody does
 * it from Staff, which is also where the people it produces turn up.
 */
// Splits on "not personal" rather than on "is manage", so an item added to
// ADMIN_NAV without a group still reaches the super admin instead of silently
// vanishing from their sidebar.
export const SUPER_ADMIN_NAV: NavItem[] = [
  ...ADMIN_NAV.filter((item) => item.group !== "Personal"),
  { href: ROUTES.adminAccess, label: "Access", icon: ShieldCheck, group: "Manage" },
  ...ADMIN_NAV.filter((item) => item.group === "Personal"),
];

export function isActiveRoute(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
