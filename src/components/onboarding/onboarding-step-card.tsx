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
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10">
          <StepIcon className="size-6 text-primary" />
        </div>
        <CardTitle>{step.title}</CardTitle>
        <CardDescription>{step.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-foreground">{step.content}</p>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} disabled={isFirst} className="flex-1">
            Back
          </Button>
          {isLast ? (
            <Button className="flex-1" onClick={onFinish}>
              Go to Dashboard
              <ArrowRight className="ml-2 size-4" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={onNext}>
              Next
              <ArrowRight className="ml-2 size-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
