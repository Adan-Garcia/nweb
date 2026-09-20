// Breakpoints match the original stylesheet (`max-width: 960px` / `560px`); Tailwind's
// `max-[N]` is exclusive, hence 961/561.

/** The full-height page wrapper shared by the auth screens. */
export const AUTH_PAGE =
  "mx-auto grid min-h-svh w-[min(1120px,100%_-_2.5rem)] items-center py-8 " +
  "max-[961px]:w-[min(740px,100%_-_1rem)] max-[961px]:py-2 max-[561px]:w-full max-[561px]:py-0";
