import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Themed native checkbox — deliberately kept as a plain `<input type="checkbox">`
 * (not the base-ui Checkbox primitive) so it stays a drop-in replacement for
 * every existing `onChange={(e) => ...}` / `table.getToggleSelectedHandler()`
 * call site without touching handler signatures.
 */
function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer rounded-[4px] border border-input bg-transparent accent-primary outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }
