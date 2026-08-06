"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      className={cn(
        "glass-inset relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "bg-primary h-full w-full flex-1 rounded-full",
          // Specular edge plus a brand bloom, so the filled portion looks lit
          // rather than painted as the bar advances.
          "shadow-[inset_0_1px_0_0_oklch(1_0_0/35%),0_0_10px_0_color-mix(in_oklab,var(--brand)_55%,transparent)]",
          "transition-transform duration-500 ease-standard",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
