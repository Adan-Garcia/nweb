import { Toaster as Sonner } from "sonner";

import { useAppearance } from "@/hooks/use-appearance";

/**
 * Where `lib/toast.ts` messages appear. Mounted once at the root; themed from the
 * preferences rather than from a theme provider, which this app does not have.
 */
export function Toaster() {
  const { isDark } = useAppearance();

  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      position="bottom-right"
      closeButton
      // Above the mobile tab bar, which sits where a toast would otherwise land.
      mobileOffset={{ bottom: 80 }}
      toastOptions={{
        classNames: {
          toast:
            "rounded-lg! border-border! bg-popover! font-sans! text-popover-foreground! shadow-overlay!",
          description: "text-muted-foreground!",
        },
      }}
      className="toaster group"
    />
  );
}
