"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Menu, X } from "lucide-react";

import { GlobalSearch } from "@/components/layout/global-search";
import { UserMenu } from "@/components/layout/user-menu";
import { ADMIN_NAV, EMPLOYEE_NAV, isActiveRoute } from "@/components/layout/nav-config";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppShellProps = {
  user: { name: string; email: string; image?: string | null };
  isAdmin: boolean;
  appName: string;
  children: React.ReactNode;
};

/**
 * Responsive dashboard chrome: a fixed sidebar on desktop, a slide-over drawer
 * on mobile, and a sticky topbar carrying global search and account controls.
 *
 * The nav is chosen here rather than passed in: its items carry Lucide icon
 * components, and a Server Component cannot serialise a function across the
 * client boundary. Selecting from `isAdmin` keeps the icons inside the client
 * bundle where they belong.
 */
export function AppShell({ user, isAdmin, appName, children }: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const nav = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;

  return (
    <div className="app-aurora flex min-h-dvh">
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          "bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform duration-200 lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href={nav[0]?.href ?? "/"} className="flex items-center gap-2 font-semibold">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
              <CalendarCheck className="size-4" aria-hidden />
            </span>
            <span className="truncate">{appName}</span>
          </Link>

          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </Button>
        </div>

        {isAdmin && (
          <div className="px-5 pb-3">
            <Badge variant="secondary" className="w-full justify-center">
              Administrator
            </Badge>
          </div>
        )}

        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {nav.map((item) => {
            const active = isActiveRoute(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-sidebar-border text-muted-foreground border-t px-5 py-4 text-xs">
          {appName} · v1.0
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </Button>

          <GlobalSearch isAdmin={isAdmin} />

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} image={user.image} isAdmin={isAdmin} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
