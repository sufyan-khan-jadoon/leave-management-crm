import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export default function NotFound() {
  return (
    <div className="app-aurora flex min-h-dvh items-center justify-center px-4">
      <Card glass className="animate-in fade-in-0 zoom-in-95 w-full max-w-md text-center duration-500 ease-standard">
        <CardContent className="space-y-4">
          <div className="bg-primary/12 text-primary-ink mx-auto flex size-12 items-center justify-center rounded-full">
            <Compass className="size-6" aria-hidden />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Page not found</h1>
            <p className="text-muted-foreground text-sm">
              The page you&apos;re looking for doesn&apos;t exist or has moved.
            </p>
          </div>

          <Button asChild className="w-full">
            <Link href={ROUTES.home}>Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
