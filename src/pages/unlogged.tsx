import { AuthBrand } from "@/components/auth/auth-brand";
import { AUTH_PAGE } from "@/components/auth/auth-layout";
import { AuthThemeToggle } from "@/components/auth/auth-theme-toggle";
import { Button } from "@/components/ui/button";
import { useThemeMode } from "@/hooks/use-theme-mode";

const SHELL =
  "relative grid min-h-[min(740px,calc(100svh_-_4rem))] overflow-hidden rounded-[28px] border-[3.5px] border-border " +
  "bg-[radial-gradient(circle_at_14%_18%,oklch(0.9_0.06_60/0.45),transparent_42%),radial-gradient(circle_at_72%_12%,oklch(0.86_0.06_230/0.36),transparent_44%),linear-gradient(155deg,oklch(1_0_0),oklch(0.985_0.006_260))] " +
  "dark:bg-[radial-gradient(circle_at_14%_18%,oklch(0.4_0.08_30/0.25),transparent_44%),radial-gradient(circle_at_80%_14%,oklch(0.42_0.07_240/0.22),transparent_44%),linear-gradient(160deg,oklch(0.18_0.01_286),oklch(0.14_0.01_286))] " +
  "max-[961px]:min-h-auto max-[961px]:grid-cols-1 max-[961px]:rounded-[22px] " +
  "max-[561px]:min-h-svh max-[561px]:rounded-none max-[561px]:border-x-0";

const BRAND_COLUMN =
  "flex flex-col justify-between border-r border-r-[oklch(0.84_0.02_286/0.5)] p-[clamp(1.4rem,4vw,3rem)] text-center " +
  "bg-[linear-gradient(180deg,oklch(1_0_0/0.55),oklch(0.98_0.012_286/0.2))] " +
  "dark:border-r-[oklch(0.35_0.01_286/0.9)] dark:bg-[linear-gradient(180deg,oklch(0.18_0.01_286/0.74),oklch(0.14_0.01_286/0.35))] " +
  "max-[961px]:gap-8 max-[961px]:border-r-0";

const COPY_TEXT =
  "m-0 min-w-full max-w-[36ch] text-[oklch(0.46_0.02_286)] dark:text-[oklch(0.8_0.015_286)]";

export function UnloggedPage() {
  const { isDark, toggleTheme } = useThemeMode();

  return (
    <main className={AUTH_PAGE}>
      <AuthThemeToggle isDark={isDark} onToggle={toggleTheme} />

      <section className={SHELL}>
        <aside className={BRAND_COLUMN}>
          <AuthBrand />

          <div className="grid min-w-full gap-4">
            <p className={`${COPY_TEXT} text-[0.72rem] tracking-[0.14em] uppercase`}>
              Early Access
            </p>
            <h1 className="m-0! min-w-full text-[clamp(1.8rem,4.5vw,3rem)]! leading-[1.06] tracking-[-0.03em]! max-[561px]:text-[clamp(1.6rem,8vw,2.15rem)]!">
              Planning, Notes, and Sharing; One place
            </h1>
            <p className={COPY_TEXT}>
              Everything you write is stored locally in this browser and never leaves it. Accounts
              and sharing are still being built, so the planner works without one. For more
              information, see our{" "}
              <a href="/privacy">
                <b>privacy policy</b>
              </a>
              .
            </p>
          </div>
          <Button
            variant="outline"
            size="lg"
            type="button"
            onClick={() => (window.location.href = "/auth/signup")}
          >
            Signup Now
          </Button>
          <div className="inline-flex flex-wrap items-center justify-center gap-[0.7rem] text-[0.88rem] text-[oklch(0.44_0.02_286)] dark:text-[oklch(0.8_0.015_286)]">
            <span>Already have an account?</span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => (window.location.href = "/auth/signin")}
            >
              Sign In
            </Button>
          </div>
        </aside>
      </section>
    </main>
  );
}
