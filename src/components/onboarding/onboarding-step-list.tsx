import { CheckCircle2 } from "lucide-react"

import type { OnboardingStep } from "@/components/onboarding/onboarding-steps"
import { cn } from "@/lib/utils"

type OnboardingStepListProps = {
  steps: OnboardingStep[]
  currentStep: number
  onSelectStep: (index: number) => void
}

/** The numbered list of steps; earlier steps show a check, the current one is highlighted. */
export function OnboardingStepList({ steps, currentStep, onSelectStep }: OnboardingStepListProps) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const isDone = index < currentStep
        const isCurrent = index === currentStep

        return (
          <button
            key={step.id}
            onClick={() => onSelectStep(index)}
            className={cn(
              "w-full text-left rounded-lg border-2 p-4 transition-all",
              isCurrent && "border-primary bg-primary/5",
              isDone && "border-green-500 bg-green-50 dark:bg-green-950/20",
              !isCurrent && !isDone && "border-muted opacity-60"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border-2",
                  isDone && "border-green-500 bg-green-500 text-white",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  !isCurrent && !isDone && "border-muted"
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <span className="text-xs font-bold">{index + 1}</span>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
