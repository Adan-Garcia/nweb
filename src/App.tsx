import { type ComponentType, lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { RouteFallback } from "@/components/route-fallback";
import { type RouteLoader, warmRoutes } from "@/lib/route-warmup";
import { IndexPage } from "@/pages/index";

/** Every route's importer, so the ones nobody opened can be fetched for offline use. */
const routeLoaders: RouteLoader[] = [];

/** Loads a page's named export on demand, so its dependencies stay out of the entry bundle. */
function lazyPage<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
) {
  routeLoaders.push(load);

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
const BoardPage = lazyPage(() => import("@/pages/board"), "BoardPage");
const NotesPage = lazyPage(() => import("@/pages/notes"), "NotesPage");
const SettingsPage = lazyPage(() => import("@/pages/settings"), "SettingsPage");

export default function App() {
  useEffect(() => {
    warmRoutes(routeLoaders);
  }, []);

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
          <Route path="/board" element={<BoardPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
