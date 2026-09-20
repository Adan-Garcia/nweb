import { MoonIcon, SunIcon } from "lucide-react";

import { BrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { useThemeMode } from "@/hooks/use-theme-mode";

import "../App.css";

export function UnloggedPage() {
  const { isDark, toggleTheme: handleToggleTheme } = useThemeMode();

  return (
    <main className="signup-page">
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
      <section className="signup-shell">
        <aside className="signup-brand">
          <a href="/auth" className="brand-mark" aria-label="Cuervo Planner home">
            <span className="brand-icon-wrap">
              <BrandIcon className="brand-icon" />
            </span>
            <span className="brand-name">Cuervo Planner</span>
          </a>

          <div className="brand-copy">
            <p className="brand-eyebrow">Early Access</p>
            <h1>Planning, Notes, and Sharing; One place</h1>
            <p>
              Create an account to keep your information encrypted and safe. Your data is stored
              locally on your device and never leaves it, for more information, see our{" "}
              <a href="/privacy" className="brand-copy-link">
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
          <div className="brand-footer">
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
