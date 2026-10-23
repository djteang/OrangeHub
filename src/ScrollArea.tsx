import { forwardRef, type HTMLAttributes } from "react";

/**
 * Shared scroll container. Keeping this as a component makes scroll behavior
 * and theme styling consistent across the desktop client without changing the
 * layout semantics of the existing panels.
 */
export const ScrollArea = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ScrollArea({ className = "", ...props }, ref) {
    return <div ref={ref} data-scroll-area className={`scroll-area ${className}`.trim()} {...props} />;
  },
);
