"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { cn } from "@/lib/utils";

function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      offset={20}
      closeButton
      toastOptions={{
        // Sonner ships its own surface colours; unset them so the toast picks
        // up the same glass treatment as every other floating panel.
        unstyled: false,
        classNames: {
          toast: cn(
            "group toast glass-strong !border-0 !bg-[var(--glass-bg-strong)] !text-foreground",
            "!rounded-xl !gap-3 !p-4",
          ),
          title: "!text-sm !font-semibold !tracking-[-0.01em]",
          description: "!text-muted-foreground !text-sm",
          actionButton: "!bg-primary !text-primary-foreground !rounded-sm",
          cancelButton: "!bg-secondary !text-secondary-foreground !rounded-sm",
          closeButton:
            "!bg-transparent !border-0 !text-muted-foreground hover:!text-foreground hover:!bg-accent/70 !rounded-sm",
          icon: "!size-4",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-destructive",
          warning: "[&_[data-icon]]:!text-warning",
          info: "[&_[data-icon]]:!text-primary",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
