"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/** Apple segmented control: recessed track, raised pill on the active segment. */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "glass-inset text-muted-foreground inline-flex h-10 w-fit items-center justify-center rounded-lg p-1",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap",
        "transition-[background-color,color,box-shadow,transform] duration-200 ease-standard",
        "hover:text-foreground active:scale-[0.98]",
        "data-[state=active]:bg-card data-[state=active]:text-foreground",
        "data-[state=active]:shadow-[inset_0_1px_0_0_var(--glass-highlight),0_1px_2px_-1px_var(--glass-shadow),0_4px_10px_-6px_var(--glass-shadow)]",
        "focus-visible:ring-ring/35 outline-none focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:opacity-45",
        "[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "flex-1 outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-300",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
