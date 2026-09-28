import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { COURSES_FORM_ID, CoursesStep } from "@/components/onboarding/courses-step";
import { OnboardingFrame } from "@/components/onboarding/onboarding-frame";
import { ONBOARDING_STEPS } from "@/components/onboarding/onboarding-steps";
import { WelcomeStep } from "@/components/onboarding/welcome-step";
import { AppearanceSection } from "@/components/settings/appearance/appearance-section";
import { FeedEditor } from "@/components/settings/feeds/feed-editor";
import { FeedsCard } from "@/components/settings/feeds/feeds-card";
import { useCalendarFeeds } from "@/components/settings/feeds/use-calendar-feeds";
import { useFeedEditor } from "@/components/settings/feeds/use-feed-editor";
import { RemindersCard } from "@/components/settings/reminders/reminders-card";
import { ServerAccountCard } from "@/components/settings/server/server-account-card";
import { useServerAccount } from "@/components/settings/server/use-server-account";
import { useLocalAccount } from "@/hooks/use-local-account";
import { useReminders } from "@/hooks/use-reminders";

/**
 * Setting a new workspace up. The steps after the welcome reuse the cards Settings shows —
 * the same feeds, appearance, sync and reminders — so what is set here is exactly what
 * Settings will show later, with nothing to keep in step between the two.
 */
export function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const feeds = useCalendarFeeds();
  const feedEditor = useFeedEditor({ onSaved: feeds.afterSave });
  const account = useServerAccount();
  const local = useLocalAccount();
  const reminders = useReminders(account.sessionFor);

  const stepId = ONBOARDING_STEPS[currentStep].id;
  const next = () => {
    if (currentStep === ONBOARDING_STEPS.length - 1) {
      void navigate("/dashboard");
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  return (
    <OnboardingFrame
      currentStep={currentStep}
      onSelectStep={setCurrentStep}
      onBack={() => setCurrentStep(Math.max(0, currentStep - 1))}
      onSkip={stepId === "courses" ? next : undefined}
      onContinue={next}
      continueFormId={stepId === "courses" ? COURSES_FORM_ID : undefined}
    >
      {stepId === "welcome" ? <WelcomeStep /> : null}

      {stepId === "courses" ? (
        <CoursesStep
          onSaved={() => {
            // The courses just added are what a feed's tasks will be filed under.
            void feeds.reload();
            next();
          }}
        />
      ) : null}

      {stepId === "calendar" ? (
        <>
          <FeedsCard
            feeds={feeds.feeds}
            isLoading={feeds.isLoading}
            busyFeedId={feeds.busyFeedId}
            onAdd={() => feedEditor.open(null)}
            onEdit={feedEditor.open}
            onRefresh={(feed) => void feeds.refresh(feed)}
            onRemove={(feed, removeTasks) => void feeds.remove(feed, removeTasks)}
          />
          <FeedEditor editor={feedEditor} branchOptions={feeds.branchOptions} />
        </>
      ) : null}

      {stepId === "appearance" ? <AppearanceSection /> : null}

      {stepId === "sync" ? (
        <>
          <ServerAccountCard {...account} localEmail={local.account?.email ?? ""} />
          <RemindersCard
            state={reminders.state}
            isWorking={reminders.isWorking}
            onEnable={() => void reminders.enable()}
            onDisable={() => void reminders.disable()}
          />
        </>
      ) : null}
    </OnboardingFrame>
  );
}
