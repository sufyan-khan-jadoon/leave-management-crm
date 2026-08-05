import { CalendarCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "size-8 rounded-md", icon: "size-4" },
  lg: { box: "size-12 rounded-lg", icon: "size-6" },
} as const;

/**
 * The app's icon tile. Lit like a physical key: a gradient body, a specular top
 * edge, and a coloured glow beneath it.
 */
export function BrandMark({
  size = "sm",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { box, icon } = SIZES[size];

  return (
    <span
      className={cn(
        "from-primary to-primary/75 text-primary-foreground flex shrink-0 items-center justify-center bg-gradient-to-br",
        "shadow-[inset_0_1px_0_0_oklch(1_0_0/25%),0_4px_10px_-4px_color-mix(in_oklab,var(--primary)_65%,transparent)]",
        box,
        className,
      )}
    >
      <CalendarCheck className={icon} aria-hidden />
    </span>
  );
}
