import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const WIDTHS = {
  narrow: "max-w-4xl",
  default: "max-w-6xl",
  wide: "max-w-[96rem]",
} as const;

type PageContainerProps = {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  className?: string;
};

/** The one set of page margins, so every workspace page lines up with every other. */
export function PageContainer({ children, width = "default", className }: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 py-6 sm:px-6 md:py-8 lg:px-8", WIDTHS[width], className)}
    >
      {children}
    </div>
  );
}
