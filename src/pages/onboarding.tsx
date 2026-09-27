import { useState } from "react";

import { AuthBrand } from "@/components/auth/auth-brand";
import { OnboardingStepCard } from "@/components/onboarding/onboarding-step-card";
import { OnboardingStepList } from "@/components/onboarding/onboarding-step-list";
import { ONBOARDING_STEPS } from "@/components/onboarding/onboarding-steps";
import { ThemeMenu } from "@/components/theme/theme-menu";

export function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const lastStep = ONBOARDING_STEPS.length - 1;

  return (
    <main className="min-h-svh w-full bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-center justify-between">
          <AuthBrand />
          <ThemeMenu />
        </div>

        <div className="mb-12 grid gap-8 md:grid-cols-2">
          <div className="flex flex-col justify-between">
            <div>
              <h1 className="mb-1 text-title">Getting Started</h1>
              <p className="mb-6 text-body text-muted-foreground">
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

        <p className="text-body text-muted-foreground">
          Guides are still being written. The{" "}
          <a href="/documentation" className="text-primary hover:underline">
            documentation page
          </a>{" "}
          lists what works today and what is still to come.
        </p>
      </div>
    </main>
  );
}
