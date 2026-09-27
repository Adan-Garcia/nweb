import { Menu } from "lucide-react";

import { MARKETING_LINKS } from "@/components/marketing/marketing-nav";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The public pages' links on a phone; `marketing-header.tsx` loads it on demand. */
export function MarketingMobileMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden" />}
      >
        <Menu className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {MARKETING_LINKS.map((link) => (
          <DropdownMenuItem key={link.href} render={<a href={link.href} />}>
            {link.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
