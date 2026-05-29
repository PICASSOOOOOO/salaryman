import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"
import { playClick } from "@/lib/ui-sound"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, onValueChange, ...props }, ref) => {
  // Throttle a soft tick as the knob is dragged so it feels tactile without
  // machine-gunning a sound on every sub-pixel value change.
  const lastTick = React.useRef(0)
  const handleValueChange = React.useCallback(
    (v: number[]) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now()
      if (now - lastTick.current > 70) {
        lastTick.current = now
        playClick()
      }
      onValueChange?.(v)
    },
    [onValueChange],
  )
  return (
  <SliderPrimitive.Root
    ref={ref}
    onValueChange={handleValueChange}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
