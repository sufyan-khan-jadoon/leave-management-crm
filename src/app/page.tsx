import Link from "next/link";
import { ShieldCheck, UserRound } from "lucide-react";

import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { appConfig } from "@/lib/env";

const ROLES = [
  {
    href: ROUTES.login,
    icon: UserRound,
    label: "Employee",
    description: "Sign in to manage your leave requests, view your balance, and track approvals.",
  },
  {
    href: ROUTES.adminLogin,
    icon: ShieldCheck,
    label: "Administrator",
    description: "Sign in to manage employees, review leave requests, and view reports.",
  },
] as const;

export default function RoleSelectionPage() {
  return (
    <div className="app-aurora flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-7 sm:py-5">
        <span className="flex items-center gap-2.5 font-semibold tracking-[-0.015em]">
          <BrandMark />
          {appConfig.name}
        </span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pb-16">
        <div className="animate-in fade-in-0 slide-in-from-bottom-2 max-w-xl space-y-3 text-center duration-500 ease-standard">
          <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.03em] md:text-[2.75rem]">
            How would you like to sign in?
          </h1>
          <p className="text-muted-foreground text-balance">Choose your role to continue.</p>
        </div>

        <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          {ROLES.map(({ href, icon: Icon, label, description }) => (
            <Link
              key={label}
              href={href}
              className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            >
              <Card glass interactive className="h-full">
                <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                  <div className="bg-primary/12 text-primary-ink flex size-14 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-spring group-hover:scale-105 group-hover:bg-primary/20">
                    <Icon className="size-7" aria-hidden />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-xl font-semibold tracking-[-0.02em]">{label}</h2>
                    <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
