import * as React from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="scrollbar-thin relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom border-separate border-spacing-0 text-sm", className)} {...props} />
    </div>
  );
}

/**
 * Sticky by default: on long lists the column labels are the only thing keeping
 * a row readable once it scrolls away from its header.
 */
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("glass-subtle sticky top-0 z-10 [&_tr]:border-0", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={className} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn("glass-subtle font-medium [&>tr:last-child>td]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group/row transition-colors duration-150 ease-standard",
        // Hover resolves through `--accent`, which is a brand-tinted mint, so
        // the row warms green without this file naming a colour.
        "hover:bg-accent/60",
        // Selection is stated in the brand green itself rather than the wash.
        "data-[state=selected]:bg-brand/12",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "text-muted-foreground h-11 px-4 text-left align-middle text-[0.6875rem] font-semibold tracking-[0.06em] uppercase whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

// The row divider lives on the cell, not the row: `border-separate` is needed
// for the sticky header to not lose its own borders, and it drops `<tr>` borders.
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("border-border/60 border-b p-4 align-middle group-last/row:border-0", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("text-muted-foreground mt-4 text-sm", className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
