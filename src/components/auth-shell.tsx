import { Button } from "@/components/ui/button"
import {
  MoonIcon,
  SunIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useThemeMode } from "@/hooks/use-theme-mode"
import { BrandIcon } from "@/components/brand-icon"

type AuthBenefit = {
  icon: ReactNode
  title: string
  copy: string
}

type AuthShellProps = {
  pageClassName: string
  shellClassName: string
  brandClassName: string
  copyClassName: string
  formPanelClassName: string
  formAriaLabel: string
  eyebrow: string
  title: string
  description: string
  form: ReactNode
  benefits?: AuthBenefit[]
  benefitsClassName?: string
  benefitClassName?: string
  benefitBadgeClassName?: string
  benefitTitleClassName?: string
  benefitCopyClassName?: string
  brandFooter?: ReactNode
}

export function AuthShell({
  pageClassName,
  shellClassName,
  brandClassName,
  copyClassName,
  formPanelClassName,
  formAriaLabel,
  eyebrow,
  title,
  description,
  form,
  benefits,
  benefitsClassName,
  benefitClassName,
  benefitBadgeClassName,
  benefitTitleClassName,
  benefitCopyClassName,
  brandFooter,
}: AuthShellProps) {
  const { isDark, toggleTheme: handleToggleTheme } = useThemeMode()

  return (
    <main className={pageClassName}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={handleToggleTheme}
        className="theme-toggle"
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      >
        {isDark ? (
          <SunIcon className="theme-toggle-icon" />
        ) : (
          <MoonIcon className="theme-toggle-icon" />
        )}
      </Button>

      <section className={shellClassName}>
        <aside className={brandClassName}>
          <a href="/auth" className="brand-mark" aria-label="Cuervo Planner home">
            <span className="brand-icon-wrap">
              <BrandIcon className="brand-icon" />
            </span>
            <span className="brand-name">Cuervo Planner</span>
          </a>

          <div className={copyClassName}>
            <p className="brand-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          {benefits?.length ? (
            <div className={benefitsClassName} aria-label="Authentication benefits">
              {benefits.map((benefit) => (
                <div className={benefitClassName} key={benefit.title}>
                  <span className={benefitBadgeClassName}>{benefit.icon}</span>
                  <div>
                    <p className={benefitTitleClassName}>{benefit.title}</p>
                    <p className={benefitCopyClassName}>{benefit.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {brandFooter}
        </aside>

        <section className={formPanelClassName} aria-label={formAriaLabel}>
          {form}
        </section>
      </section>
    </main>
  )
}