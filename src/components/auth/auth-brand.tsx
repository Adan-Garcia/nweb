import { BrandIcon } from "@/components/brand-icon";

/** The Cuervo Planner mark and name, linking to the auth start page. */
export function AuthBrand() {
  return (
    <a
      href="/auth"
      className="inline-flex w-fit items-center gap-3 text-inherit no-underline"
      aria-label="Cuervo Planner home"
    >
      <span className="inline-flex size-8 items-center justify-center rounded-[0.65rem] bg-[oklch(0.6_0.18_18)] text-[oklch(0.99_0.01_18)]">
        <BrandIcon className="size-[1.15rem]" />
      </span>
      <span className="text-[0.96rem] font-semibold tracking-[0.04em]">Cuervo Planner</span>
    </a>
  );
}
