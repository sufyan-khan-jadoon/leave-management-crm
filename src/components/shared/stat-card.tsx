import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "destructive" | "neutral";

const TONE_STYLES: Record<Tone, { icon: string; accent: string }> = {
  primary: { icon: "bg-primary/12 text-primary", accent: "from-primary/10" },
  success: { icon: "bg-success/12 text-success", accent: "from-success/10" },
  warning: { icon: "bg-warning/15 text-warning", accent: "from-warning/12" },
  destructive: { icon: "bg-destructive/12 text-destructive", accent: "from-destructive/10" },
  neutral: { icon: "bg-muted text-muted-foreground", accent: "from-muted/60" },
};

type StatCardProps = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  className?: string;
};

export function StatCard({ label, value, icon: Icon, tone = "primary", hint, className }: StatCardProps) {
  const styles = TONE_STYLES[tone];

  return (
    <Card interactive className={cn("relative overflow-hidden py-0", className)}>
      <div
        className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent", styles.accent)}
        aria-hidden
      />
      <CardContent className="relative flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground truncate text-sm font-medium">{label}</p>
          <p className="text-[2rem] leading-none font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
          {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", styles.icon)}>
          <Icon className="size-5" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="py-0">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="w-full space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="size-10 rounded-md" />
      </CardContent>
    </Card>
  );
}
