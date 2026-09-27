import { BrandIcon } from "@/components/layout/brand-icon";

/** The Cuervo Planner mark and name, linking to the auth start page. */
export function AuthBrand() {
  return (
    <a
      href="/auth"
      className="inline-flex w-fit items-center gap-2.5 text-heading"
      aria-label="Cuervo Planner home"
    >
      <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <BrandIcon className="size-4" />
      </span>
      Cuervo Planner
    </a>
  );
}
