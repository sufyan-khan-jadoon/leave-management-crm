import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("bg-muted/70 shimmer rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
