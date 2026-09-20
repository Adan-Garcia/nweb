import { LandingBenefits } from "@/components/marketing/landing-benefits";
import { LandingHeader } from "@/components/marketing/landing-header";
import { Button } from "@/components/ui/button";
import { useThemeMode } from "@/hooks/use-theme-mode";

import "../App.css";

export function IndexPage() {
  const { isDark, toggleTheme } = useThemeMode();

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <LandingHeader isDark={isDark} onToggleTheme={toggleTheme} />

      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="mb-12">
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold">Cuervo Planner</h1>
            <p className="text-lg text-muted-foreground">
              A simple homework planner and note taking app built with privacy in mind. Create an
              account to keep your information encrypted and safe. Your data is stored locally on
              your device and never leaves it, for more information, see our{" "}
              <a href="/privacy" className="text-primary hover:underline">
                <b>privacy policy</b>
              </a>
            </p>
          </div>
        </div>

        <Button
          variant="default"
          type="button"
          className="mt-8 mb-8 min-h-12 max-h-32 min-w-48 max-w-64 shadow-lg ring-4 ring-primary/30 hover:ring-primary/50 focus:ring-primary/50 active:ring-primary/50"
          onClick={() => (window.location.href = "/auth/")}
        >
          Get Started Now
        </Button>

        <LandingBenefits />
      </div>
    </main>
  );
}
