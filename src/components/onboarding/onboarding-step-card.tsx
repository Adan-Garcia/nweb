import { ArrowRight } from "lucide-react";

import type { OnboardingStep } from "@/components/onboarding/onboarding-steps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OnboardingStepCardProps = {
  step: OnboardingStep;
  isFirst: boolean;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
};

/** The current step's explanation and its Back / Next (or finish) buttons. */
export function OnboardingStepCard({
  step,
  isFirst,
  isLast,
  onBack,
  onNext,
  onFinish,
}: OnboardingStepCardProps) {
  const StepIcon = step.icon;

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-brand-soft">
          <StepIcon className="size-5 text-primary" />
        </div>
        <CardTitle className="text-heading">{step.title}</CardTitle>
        <CardDescription>{step.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-body text-foreground">{step.content}</p>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} disabled={isFirst} className="flex-1">
            Back
          </Button>
          {isLast ? (
            <Button className="flex-1" onClick={onFinish}>
              Go to Dashboard
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={onNext}>
              Next
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
