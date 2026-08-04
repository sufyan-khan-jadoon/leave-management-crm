import Link from "next/link";
import { ArrowRight, BarChart3, CalendarCheck, MailCheck, ShieldCheck, Sparkles, Users } from "lucide-react";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MONTHLY_LEAVE_ALLOWANCE, ROUTES } from "@/lib/constants";
import { appConfig } from "@/lib/env";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Request leave in plain English",
    description:
      "Type \"I need leave on Friday for university exams\" — Gemini extracts the date and reason, and the request is filed instantly.",
  },
  {
    icon: ShieldCheck,
    title: "Automatic policy enforcement",
    description: `Up to ${MONTHLY_LEAVE_ALLOWANCE} leaves per month are approved automatically. Beyond that, requests route to HR.`,
  },
  {
    icon: MailCheck,
    title: "Verified accounts, every time",
    description: "Six-digit email verification with expiring codes keeps your employee directory trustworthy.",
  },
  {
    icon: BarChart3,
    title: "Insight at a glance",
    description: "Monthly trends and department breakdowns show where leave is concentrating before it bites.",
  },
  {
    icon: Users,
    title: "Full employee management",
    description: "Search, filter, edit, suspend or remove employees — and export leave history to CSV.",
  },
  {
    icon: CalendarCheck,
    title: "Everyone stays informed",
    description: "Employees are emailed on registration, verification, and every approval or rejection.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="app-aurora flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <CalendarCheck className="size-4" aria-hidden />
          </span>
          {appConfig.name}
        </span>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href={ROUTES.adminLogin}>Admin</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={ROUTES.login}>Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        <section className="flex flex-col items-center gap-6 py-16 text-center md:py-24">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Sparkles className="size-3.5" aria-hidden />
            Powered by Google Gemini
          </Badge>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Leave management that understands{" "}
            <span className="from-primary to-chart-5 bg-gradient-to-r bg-clip-text text-transparent">
              how people actually write
            </span>
          </h1>

          <p className="text-muted-foreground max-w-2xl text-lg text-balance">
            No date pickers, no dropdowns. Employees describe the leave they need, AI turns it into structured
            data, and your monthly policy is applied automatically.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href={ROUTES.register}>
                Get started free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={ROUTES.adminLogin}>Administrator sign in</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} glass className="h-full">
              <CardContent className="space-y-3">
                <div className="bg-primary/12 text-primary flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h2 className="font-semibold">{title}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto w-full max-w-6xl px-6 py-6 text-sm">
          {appConfig.name} — AI-powered leave management.
        </div>
      </footer>
    </div>
  );
}
