import { useState } from "react";

import { BrandIcon } from "@/components/brand-icon";
import { ThemeToggleButton } from "@/components/marketing/theme-toggle-button";
import { OnboardingStepCard } from "@/components/onboarding/onboarding-step-card";
import { OnboardingStepList } from "@/components/onboarding/onboarding-step-list";
import { ONBOARDING_STEPS } from "@/components/onboarding/onboarding-steps";
import { useThemeMode } from "@/hooks/use-theme-mode";

export function OnboardingPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const [currentStep, setCurrentStep] = useState(0);
  const lastStep = ONBOARDING_STEPS.length - 1;

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2 font-medium">
            <BrandIcon className="size-8" />
            <span>Cuervo Planner</span>
          </a>
          <ThemeToggleButton isDark={isDark} onToggle={toggleTheme} variant="outline" size="sm" />
        </div>

        <div className="mb-12 grid gap-8 md:grid-cols-2">
          <div className="flex flex-col justify-between">
            <div>
              <h1 className="mb-2 text-3xl font-bold">Getting Started</h1>
              <p className="mb-8 text-muted-foreground">
                Step {currentStep + 1} of {ONBOARDING_STEPS.length}
              </p>

              <OnboardingStepList
                steps={ONBOARDING_STEPS}
                currentStep={currentStep}
                onSelectStep={setCurrentStep}
              />
            </div>
          </div>

          <OnboardingStepCard
            step={ONBOARDING_STEPS[currentStep]}
            isFirst={currentStep === 0}
            isLast={currentStep === lastStep}
            onBack={() => setCurrentStep(Math.max(0, currentStep - 1))}
            onNext={() => setCurrentStep(Math.min(lastStep, currentStep + 1))}
            onFinish={() => (window.location.href = "/dashboard")}
          />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Guides are still being written. The{" "}
          <a href="/documentation" className="text-primary hover:underline">
            documentation page
          </a>{" "}
          lists what is built and what is planned.
        </p>
      </div>
    </main>
  );
}
