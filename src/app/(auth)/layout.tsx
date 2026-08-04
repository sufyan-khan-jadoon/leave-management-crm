import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { appConfig } from "@/lib/env";
import { ROUTES } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-aurora flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Link href={ROUTES.home} className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <CalendarCheck className="size-4" aria-hidden />
          </span>
          {appConfig.name}
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
