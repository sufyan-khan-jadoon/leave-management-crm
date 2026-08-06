import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Solid variants carry a specular top edge (`inset 0 1px 0`) and a tinted glow
 * that only appears on hover — the same two-part lighting model the glass
 * surfaces use, scaled down to control size.
 *
 * The brand fill stays flat #0AEA0A rather than becoming a two-stop gradient:
 * the "gradient" read comes from a white inset sheen falling down from the top
 * edge, which is light rather than pigment, so the brand colour underneath is
 * never darkened. The glow beneath is the brand green at low alpha, which is
 * what makes the button look lit from within on both themes.
 */
const buttonVariants = cva(
  cn(
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
    "transition-[background-color,box-shadow,transform,color,opacity] duration-200 ease-standard",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    "active:scale-[0.97] active:duration-100",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        default: cn(
          "bg-primary text-primary-foreground font-semibold",
          "shadow-[inset_0_1px_0_0_oklch(1_0_0/38%),inset_0_7px_14px_-8px_oklch(1_0_0/30%),0_1px_2px_-1px_var(--glass-shadow),0_6px_18px_-8px_color-mix(in_oklab,var(--brand)_60%,transparent)]",
          "hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/45%),inset_0_7px_14px_-8px_oklch(1_0_0/38%),0_2px_4px_-2px_var(--glass-shadow),0_12px_30px_-8px_color-mix(in_oklab,var(--brand)_78%,transparent)]",
        ),
        destructive: cn(
          "bg-destructive text-destructive-foreground",
          "shadow-[inset_0_1px_0_0_oklch(1_0_0/25%),0_1px_2px_-1px_var(--glass-shadow),0_6px_16px_-8px_color-mix(in_oklab,var(--destructive)_55%,transparent)]",
          "hover:bg-destructive/92 hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/25%),0_2px_4px_-2px_var(--glass-shadow),0_10px_24px_-8px_color-mix(in_oklab,var(--destructive)_65%,transparent)]",
          "focus-visible:ring-destructive/35",
        ),
        success: cn(
          "bg-success text-success-foreground font-semibold",
          "shadow-[inset_0_1px_0_0_oklch(1_0_0/38%),inset_0_7px_14px_-8px_oklch(1_0_0/30%),0_1px_2px_-1px_var(--glass-shadow),0_6px_18px_-8px_color-mix(in_oklab,var(--success)_60%,transparent)]",
          "hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/45%),inset_0_7px_14px_-8px_oklch(1_0_0/38%),0_2px_4px_-2px_var(--glass-shadow),0_12px_30px_-8px_color-mix(in_oklab,var(--success)_78%,transparent)]",
          "focus-visible:ring-success/35",
        ),
        outline: cn(
          "text-foreground glass-inset",
          "hover:bg-accent/60 hover:text-accent-foreground",
        ),
        secondary: cn(
          "bg-secondary text-secondary-foreground",
          "shadow-[inset_0_1px_0_0_var(--glass-highlight),inset_0_0_0_1px_var(--glass-hairline)]",
          "hover:bg-secondary/70",
        ),
        /** Floating translucent control — for chrome that sits over content. */
        glass: "glass text-foreground rounded-md hover:bg-accent/45",
        ghost: "text-foreground/80 hover:bg-accent/70 hover:text-accent-foreground",
        link: "text-primary-ink underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 rounded-sm px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-6 text-[0.9375rem] has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants, type ButtonProps };
