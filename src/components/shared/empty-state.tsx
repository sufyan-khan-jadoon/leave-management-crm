import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm text-balance">{description}</p>
      </div>
      {action}
    </div>
  );
}
