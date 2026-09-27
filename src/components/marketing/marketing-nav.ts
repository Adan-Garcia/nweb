export type NavLink = {
  label: string;
  href: string;
};

/** Public repository, linked from the footer so the "Open Source" claim can be checked. */
export const REPOSITORY_URL = "https://github.com/Adan-Garcia/nweb";

/** Links in the header of every public page. The app itself is the header's button. */
export const MARKETING_LINKS: NavLink[] = [
  { label: "Documentation", href: "/documentation" },
  { label: "Pricing", href: "/pricing" },
  { label: "Privacy", href: "/privacy" },
];
