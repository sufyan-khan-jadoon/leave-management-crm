import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "glass-inset placeholder:text-muted-foreground/80 flex field-sizing-content min-h-20 w-full rounded-lg border-0 px-3.5 py-2.5 text-base leading-relaxed outline-none md:text-sm",
        "transition-[box-shadow,background-color] duration-200 ease-standard",
        "hover:bg-card/70",
        "focus-visible:bg-card/80 focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklab,var(--ring)_28%,transparent)]",
        "aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_oklab,var(--destructive)_22%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
