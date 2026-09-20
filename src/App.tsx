import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { RouteFallback } from "@/components/route-fallback";
import { IndexPage } from "@/pages/index";
import "./App.css";

/** Loads a page's named export on demand, so its dependencies stay out of the entry bundle. */
function lazyPage<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
) {
  return lazy(async () => ({ default: (await load())[name] }));
}

// Every route except the landing page loads on demand. Notes alone pulls in
// Excalidraw, TipTap and pdf.js, which the other pages should not pay for.
const SignupPage = lazyPage(() => import("@/pages/signup"), "SignupPage");
const UnloggedPage = lazyPage(() => import("@/pages/unlogged"), "UnloggedPage");
const OnboardingPage = lazyPage(() => import("@/pages/onboarding"), "OnboardingPage");
const DashboardPage = lazyPage(() => import("@/pages/dashboard"), "DashboardPage");
const SignInPage = lazyPage(() => import("@/pages/signin"), "SignInPage");
const DocumentationPage = lazyPage(() => import("@/pages/documentation"), "DocumentationPage");
const PricingPage = lazyPage(() => import("@/pages/pricing"), "PricingPage");
const PrivacyPage = lazyPage(() => import("@/pages/privacy"), "PrivacyPage");
const CalendarPage = lazyPage(() => import("@/pages/calendar"), "CalendarPage");
const NotesPage = lazyPage(() => import("@/pages/notes"), "NotesPage");

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<IndexPage />} />
          <Route path="/auth" element={<UnloggedPage />} />
          <Route path="/auth/signup" element={<SignupPage />} />
          <Route path="/auth/signin" element={<SignInPage />} />
          <Route path="/auth/onboarding" element={<OnboardingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/documentation" element={<DocumentationPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
