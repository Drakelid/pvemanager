import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

/**
 * Linear progress bar. Consolidates the ad-hoc `<div className="h-1.5
 * rounded-full bg-track">` fills scattered across Dashboard/InstancesPage
 * into one accessible (role="progressbar") primitive.
 */
function Progress({
  className,
  value,
  ...props
}: ProgressPrimitive.Root.Props & { className?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("w-full", className)}
      {...props}
    >
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className="block h-1.5 w-full overflow-hidden rounded-full bg-track"
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="block h-full rounded-full bg-primary transition-all duration-500 data-[state=indeterminate]:animate-pulse"
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
