"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] Rendering error:", error);
  }, [error]);

  return (
    <div className="app-aurora flex min-h-dvh items-center justify-center px-4">
      <Card glass className="w-full max-w-md text-center shadow-xl">
        <CardContent className="space-y-4">
          <div className="bg-destructive/12 text-destructive mx-auto flex size-12 items-center justify-center rounded-full">
            <AlertTriangle className="size-6" aria-hidden />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">
              An unexpected error interrupted this page. Trying again usually resolves it.
            </p>
            {error.digest && (
              <p className="text-muted-foreground font-mono text-xs">Reference: {error.digest}</p>
            )}
          </div>

          <Button onClick={reset} className="w-full">
            <RotateCw className="size-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
