import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  /** Draw the recessed well. Turn off when nesting inside a card, which already
      provides the surface — stacking two wells reads as a rendering mistake. */
  inset?: boolean;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  inset = true,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-14 text-center",
        inset && "glass-inset",
        className,
      )}
    >
      <div className="bg-primary/10 text-primary-ink flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold tracking-[-0.012em]">{title}</p>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm text-balance">{description}</p>
      </div>
      {action}
    </div>
  );
}
