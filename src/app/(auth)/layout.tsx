import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { appConfig } from "@/lib/env";
import { ROUTES } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-aurora flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-7 sm:py-5">
        <Link
          href={ROUTES.home}
          className="flex items-center gap-2.5 font-semibold tracking-[-0.015em] transition-opacity duration-200 ease-standard hover:opacity-75"
        >
          <BrandMark />
          {appConfig.name}
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-14">
        <div className="animate-in fade-in-0 slide-in-from-bottom-2 w-full max-w-md duration-500 ease-standard">
          {children}
        </div>
      </main>
    </div>
  );
}
