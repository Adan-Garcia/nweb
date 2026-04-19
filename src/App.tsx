import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { SignupPage } from "@/pages/signup"
import { UnloggedPage } from "@/pages/unlogged"
import { OnboardingPage } from "@/pages/onboarding"
import { DashBoardPage } from "@/pages/dashboard"
import { SignInPage } from "@/pages/signin"
import {IndexPage} from "@/pages/index"
import { DocumentationPage } from "@/pages/documentation"
import { PricingPage } from "@/pages/pricing"
import { PrivacyPage } from "@/pages/privacy"
import { CalendarPage } from "@/pages/calendar.tsx"
import { NotesPage } from "@/pages/notes"
import "./App.css"

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<IndexPage />} />
				<Route path="/auth" element={<UnloggedPage />} />
				<Route path="/auth/signup" element={<SignupPage />} />
				<Route path="/auth/signin" element={<SignInPage />} />
				<Route path="/auth/onboarding" element={<OnboardingPage />} />
				<Route path="/dashboard" element={<DashBoardPage />} />
				<Route path="/documentation" element={<DocumentationPage />} />
				<Route path="/pricing" element={<PricingPage />} />
				<Route path="/privacy" element={<PrivacyPage />} />
				<Route path="/calendar" element={<CalendarPage />} />
				<Route path="/notes" element={<NotesPage />} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</BrowserRouter>
	)
}
