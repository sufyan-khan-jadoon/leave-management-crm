"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-0 p-0.5 outline-none",
        "transition-[background-color,box-shadow] duration-300 ease-standard",
        "data-[state=unchecked]:bg-input data-[state=unchecked]:shadow-[inset_0_1px_2px_0_var(--glass-shadow)]",
        "data-[state=checked]:bg-primary data-[state=checked]:shadow-[inset_0_1px_0_0_oklch(1_0_0/20%),0_2px_8px_-3px_color-mix(in_oklab,var(--primary)_60%,transparent)]",
        "focus-visible:ring-ring/35 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-white ring-0",
          "shadow-[0_1px_2px_0_oklch(0_0_0/16%),0_2px_6px_-1px_oklch(0_0_0/12%)]",
          "transition-transform duration-300 ease-spring",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
