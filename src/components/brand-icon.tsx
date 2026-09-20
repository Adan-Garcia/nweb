import type * as React from "react";

import { cn } from "@/lib/utils";

type BrandIconProps = React.ComponentPropsWithoutRef<"img">;

export function BrandIcon({ className, alt = "", ...props }: BrandIconProps) {
  return (
    <img
      src="/brand-mark.svg"
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      decoding="async"
      className={cn("inline-block size-4 shrink-0 object-contain", className)}
      {...props}
    />
  );
}
