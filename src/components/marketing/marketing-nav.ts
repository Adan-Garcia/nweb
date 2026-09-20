export type NavLink = {
  label: string
  href: string
}

/** Links in the header of the public information pages. */
export const MARKETING_LINKS: NavLink[] = [
  { label: "About", href: "/" },
  { label: "Documentation", href: "/documentation" },
  { label: "Pricing", href: "/pricing" },
  { label: "Privacy", href: "/privacy" },
]

/** Links in the landing page header (adds the calendar; About stays on the page). */
export const LANDING_LINKS: NavLink[] = [
  { label: "About", href: "#" },
  { label: "Documentation", href: "/documentation" },
  { label: "Pricing", href: "/pricing" },
  { label: "Privacy", href: "/privacy" },
  { label: "Calendar", href: "/calendar" },
]
