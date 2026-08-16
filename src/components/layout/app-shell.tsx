"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { ZovenciaLogo } from "@/components/layout/zovencia-logo";
import { GlobalSearch } from "@/components/layout/global-search";
import { UserMenu } from "@/components/layout/user-menu";
import { ADMIN_NAV, EMPLOYEE_NAV, SUPER_ADMIN_NAV, isActiveRoute } from "@/components/layout/nav-config";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppShellProps = {
  user: { name: string; email: string; image?: string | null };
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  appName: string;
  children: React.ReactNode;
};

/**
 * Responsive dashboard chrome: a floating glass sidebar on desktop, a slide-over
 * drawer on mobile, and a floating topbar carrying global search and account
 * controls. Both panels are inset from the viewport edges so the aurora reads
 * around them — that gap is what makes them read as glass rather than as paint.
 *
 * The nav is chosen here rather than passed in: its items carry Lucide icon
 * components, and a Server Component cannot serialise a function across the
 * client boundary. Selecting from `isAdmin` keeps the icons inside the client
 * bundle where they belong.
 */
export function AppShell({ user, isAdmin, isSuperAdmin = false, appName, children }: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const nav = isSuperAdmin ? SUPER_ADMIN_NAV : isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;

  return (
    <div className="app-aurora min-h-dvh">
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="animate-in fade-in-0 fixed inset-0 z-40 bg-black/25 backdrop-blur-md duration-200 lg:hidden dark:bg-black/45"
        />
      )}

      {/*
        Marked `no-print` along with the topbar below: navigation has nothing to
        say on paper, and a printed report should be the report. `app-shell-body`
        is what lets the print stylesheet reclaim the gutter this reserved —
        hiding the sidebar without dropping the offset leaves a blank sixth of
        the page down the left.
      */}
      <aside
        className={cn(
          "glass-sidebar no-print fixed z-50 flex flex-col transition-transform duration-300 ease-standard",
          "inset-y-3 left-3 w-[16.5rem] rounded-2xl",
          "lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
        )}
      >
        <div className="flex h-16 items-center justify-between px-4">
          {/*
            The **mark** beside the product name, not the full logo. The full
            artwork already spells ZOVENCIA, so setting `appName` next to it
            would read "ZOVENCIA ZOVENCIA PRESENCE"; the standalone Z is the
            compact brand mark and carries the lockup without the stutter.

            No `surface` is needed here even though the panel is a dark green
            slab in both themes — the mark is one file on every ground. The name
            beside it inherits `--sidebar-foreground` from `glass-sidebar`.
          */}
          <Link
            href={nav[0]?.href ?? "/"}
            className="focus-visible:ring-ring/35 flex min-w-0 items-center gap-2.5 rounded-md font-semibold tracking-[-0.015em] outline-none focus-visible:ring-[3px]"
          >
            <ZovenciaLogo priority />
            <span className="truncate text-[0.9375rem]">{appName}</span>
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
          <div className="px-4 pb-3">
            <Badge variant="secondary" className="w-full justify-center py-1">
              Administrator
            </Badge>
          </div>
        )}

        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {nav.map((item, index) => {
            const active = isActiveRoute(pathname, item);
            // Printed once, when the group changes — so the config stays a flat
            // list and the heading cannot drift out of step with its items.
            const heading = item.group && item.group !== nav[index - 1]?.group ? item.group : null;

            return (
              <div key={item.href}>
                {heading && (
                  <p
                    className={cn(
                      "text-muted-foreground/80 px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase",
                      index === 0 ? "pt-1" : "pt-4",
                    )}
                  >
                    {heading}
                  </p>
                )}

                <Link
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                    "transition-[background-color,color,transform] duration-200 ease-standard active:scale-[0.98]",
                    active
                      ? "text-primary-ink bg-brand/15 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent)]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {/* Brand-green rail on the active item. Animating scaleY off a
                      centre origin lets it grow out of the row rather than blink. */}
                  <span
                    className={cn(
                      "bg-brand absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full",
                      "shadow-[0_0_12px_0_color-mix(in_oklab,var(--brand)_70%,transparent)]",
                      "origin-center transition-transform duration-300 ease-spring",
                      active ? "scale-y-100" : "scale-y-0",
                    )}
                    aria-hidden
                  />
                  <item.icon
                    className={cn(
                      "size-4 shrink-0 transition-colors duration-200",
                      active ? "text-brand" : "text-muted-foreground group-hover:text-foreground",
                    )}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="border-border/50 text-muted-foreground border-t px-4 py-3.5 text-xs">
          {appName} · v1.0
        </div>
      </aside>

      <div className="app-shell-body flex min-h-dvh min-w-0 flex-col lg:pl-[17.5rem]">
        <div className="no-print sticky top-0 z-30 px-3 pt-3 sm:px-4 lg:pr-4">
          <header className="glass flex h-14 items-center gap-2 rounded-xl px-2 sm:px-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </Button>

            {/*
              Small screens only, and the compact mark rather than the wordmark.
              Below `lg` the sidebar is off-canvas, so without this there is no
              Zovencia anywhere on the screen; above it the sidebar is showing
              the full logo an inch away, and a second one would be clutter.
              The header follows the theme, so the mark needs no `surface`.
            */}
            <ZovenciaLogo size="sm" className="ml-0.5 lg:hidden" />

            <GlobalSearch isAdmin={isAdmin} />

            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <UserMenu name={user.name} email={user.email} image={user.image} isAdmin={isAdmin} />
            </div>
          </header>
        </div>

        <main className="flex-1 px-3 py-6 sm:px-4 lg:pr-4">{children}</main>
      </div>
    </div>
  );
}
