import Link from "next/link";
import { CalendarCheck, ShieldCheck, UserRound } from "lucide-react";

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
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <CalendarCheck className="size-4" aria-hidden />
          </span>
          {appConfig.name}
        </span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            How would you like to sign in?
          </h1>
          <p className="text-muted-foreground text-balance">
            Choose your role to continue.
          </p>
        </div>

        <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          {ROLES.map(({ href, icon: Icon, label, description }) => (
            <Link key={label} href={href} className="group">
              <Card
                glass
                className="h-full shadow-xl transition-all duration-300 group-hover:shadow-2xl group-hover:-translate-y-1 group-hover:border-primary/40"
              >
                <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                  <div className="bg-primary/12 text-primary flex size-14 items-center justify-center rounded-full transition-colors duration-300 group-hover:bg-primary/20">
                    <Icon className="size-7" aria-hidden />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-xl font-semibold">{label}</h2>
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
