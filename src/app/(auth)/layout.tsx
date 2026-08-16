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
          The full logo, theme-aware. This header sits on `app-aurora`, which
          does follow the theme, so the wordmark switches with it. The app name
          is dropped rather than printed beside it — the wordmark is the name,
          and the two together read as it twice.
        */}
        <Link
          href={ROUTES.home}
          aria-label={`${appConfig.name} home`}
          className="focus-visible:ring-ring/35 flex items-center rounded-md outline-none transition-opacity duration-200 ease-standard hover:opacity-75 focus-visible:ring-[3px]"
        >
          <ZovenciaLogo variant="full" priority />
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
