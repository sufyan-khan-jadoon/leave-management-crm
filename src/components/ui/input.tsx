import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "glass-inset file:text-foreground placeholder:text-muted-foreground/80 selection:bg-primary selection:text-primary-foreground flex h-10 w-full min-w-0 rounded-lg border-0 px-3.5 py-1 text-base outline-none md:text-sm",
        "transition-[box-shadow,background-color] duration-200 ease-standard",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "hover:bg-card/70",
        // The focus ring replaces the inset well entirely, so the control reads
        // as lifting out of the surface rather than gaining a second border.
        "focus-visible:bg-card/80 focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklab,var(--ring)_28%,transparent)]",
        "aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_oklab,var(--destructive)_22%,transparent)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
