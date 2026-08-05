import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status badges use a tinted wash plus a same-hue rim rather than a solid fill,
 * so a row of them reads as quiet metadata instead of competing for attention.
 */
const badgeVariants = cva(
  cn(
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-0.5",
    "text-xs font-medium whitespace-nowrap",
    "transition-colors duration-200 ease-standard",
    "[&>svg]:size-3",
  ),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/20%)]",
        secondary:
          "bg-secondary/80 text-secondary-foreground shadow-[inset_0_0_0_1px_var(--glass-hairline)]",
        destructive:
          "bg-destructive/12 text-destructive shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--destructive)_28%,transparent)]",
        success:
          "bg-success/12 text-success shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--success)_28%,transparent)]",
        warning:
          "bg-warning/15 text-warning shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warning)_32%,transparent)]",
        outline: "text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
