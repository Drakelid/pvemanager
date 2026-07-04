import { cn } from "@/lib/utils"

/**
 * Placeholder shimmer for content that is still loading. Prefer this over a
 * blocking spinner for loads that may exceed ~300ms. The pulse animation is
 * automatically neutralised under prefers-reduced-motion (see index.css).
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
