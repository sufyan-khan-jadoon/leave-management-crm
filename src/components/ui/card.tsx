import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Glass is the baseline surface. `glass` opts into the denser fill used where a
 * card floats directly over the aurora (auth screens, error states) and needs
 * more contrast behind its text than the ambient wash provides.
 */
function Card({
  className,
  glass = false,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { glass?: boolean; interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        // `min-w-0` keeps a card from inflating its grid/flex track: a wide
        // table inside would otherwise push its intrinsic minimum onto the
        // track and overflow the page horizontally on narrow viewports.
        "text-card-foreground flex min-w-0 flex-col gap-6 rounded-xl py-6",
        glass ? "glass-strong" : "glass",
        interactive && "hover-lift",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-[0.9375rem] leading-none font-semibold tracking-[-0.012em]", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm leading-relaxed", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
