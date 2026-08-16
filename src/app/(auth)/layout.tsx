import Link from "next/link";

import { ZovenciaLogo } from "@/components/layout/zovencia-logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { appConfig } from "@/lib/env";
import { ROUTES } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-aurora flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-7 sm:py-5">
        {/*
          The mark beside the product name. The full artwork already spells
          ZOVENCIA, so putting `appName` next to it would read it twice — the
          standalone Z carries the lockup instead, and is one file on both
          themes while the name beside it follows the theme as ordinary text.
        */}
        <Link
          href={ROUTES.home}
          className="focus-visible:ring-ring/35 flex items-center gap-2.5 rounded-md font-semibold tracking-[-0.015em] outline-none transition-opacity duration-200 ease-standard hover:opacity-75 focus-visible:ring-[3px]"
        >
          <ZovenciaLogo priority />
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
