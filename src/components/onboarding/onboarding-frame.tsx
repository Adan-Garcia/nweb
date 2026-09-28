import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { AuthBrand } from "@/components/auth/auth-brand";
import { OnboardingStepList } from "@/components/onboarding/onboarding-step-list";
import { ONBOARDING_STEPS } from "@/components/onboarding/onboarding-steps";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OnboardingFrameProps = {
  currentStep: number;
  onSelectStep: (index: number) => void;
  onBack: () => void;
  /** Moves on without doing the step; offered only where Continue would save something. */
  onSkip?: () => void;
  onContinue: () => void;
  /** Continue submits this form instead, and the form moves on once it has saved. */
  continueFormId?: string;
  children: ReactNode;
};

/** The page around every step: where you are, the step itself, and the way on. */
export function OnboardingFrame({
  currentStep,
  onSelectStep,
  onBack,
  onSkip,
  onContinue,
  continueFormId,
  children,
}: OnboardingFrameProps) {
  const step = ONBOARDING_STEPS[currentStep];
  const StepIcon = step.icon;
  const isLast = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <main className="min-h-svh w-full bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-center justify-between">
          <AuthBrand />
          <ThemeMenu />
        </div>

        <div className="grid items-start gap-8 md:grid-cols-[16rem_1fr]">
          <div>
            <h1 className="mb-1 text-title">Set up your planner</h1>
            <p className="mb-6 text-body text-muted-foreground">
              Step {currentStep + 1} of {ONBOARDING_STEPS.length}
            </p>
            <OnboardingStepList
              steps={ONBOARDING_STEPS}
              currentStep={currentStep}
              onSelectStep={onSelectStep}
            />
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-brand-soft">
                <StepIcon className="size-5 text-primary" aria-hidden="true" />
              </div>
              <CardTitle className="text-heading">
                <h2>{step.title}</h2>
              </CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-6">
              {children}

              <div className="flex flex-wrap gap-3 border-t pt-4">
                <Button variant="outline" onClick={onBack} disabled={currentStep === 0}>
                  Back
                </Button>
                <div className="ml-auto flex gap-3">
                  {onSkip ? (
                    <Button variant="ghost" onClick={onSkip}>
                      Skip for now
                    </Button>
                  ) : null}
                  <Button
                    type={continueFormId ? "submit" : "button"}
                    form={continueFormId}
                    onClick={continueFormId ? undefined : onContinue}
                  >
                    {isLast ? "Go to the dashboard" : "Continue"}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
