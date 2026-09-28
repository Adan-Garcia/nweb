import { CheckCircle2 } from "lucide-react";

import type { OnboardingStep } from "@/components/onboarding/onboarding-steps";
import { cn } from "@/lib/utils";

type OnboardingStepListProps = {
  steps: OnboardingStep[];
  currentStep: number;
  onSelectStep: (index: number) => void;
};

/** The numbered list of steps; earlier steps show a check, the current one is highlighted. */
export function OnboardingStepList({ steps, currentStep, onSelectStep }: OnboardingStepListProps) {
  return (
    <div className="grid gap-2">
      {steps.map((step, index) => {
        const isDone = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <button
            key={step.id}
            type="button"
            aria-current={isCurrent ? "step" : undefined}
            onClick={() => onSelectStep(index)}
            className={cn(
              "w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
              isCurrent && "border-primary bg-brand-soft hover:bg-brand-soft",
              !isCurrent && !isDone && "text-muted-foreground",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  isDone && "border-primary text-primary",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  !isCurrent && !isDone && "border-muted",
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <span className="text-xs font-bold">{index + 1}</span>
                )}
              </div>
              <div>
                <p className="text-body font-medium text-foreground">{step.title}</p>
                <p className="text-caption text-muted-foreground">{step.description}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
