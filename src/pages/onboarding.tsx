import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	MoonIcon,
	SunIcon,
	CheckCircle2,
	Zap,
	Users,
	Sparkles,
	ArrowRight,
} from "lucide-react"
import { useState } from "react"
import { useThemeMode } from "@/hooks/use-theme-mode"
import { BrandIcon } from "@/components/brand-icon"
import "../App.css"

export function OnboardingPage() {
	const { isDark, toggleTheme: handleToggleTheme } = useThemeMode()
	const [currentStep, setCurrentStep] = useState(0)

	const onboardingSteps = [
		{
			title: "Welcome to Cuervo Planner",
			description: "Let's set up your workspace",
			icon: Sparkles,
			content:
				"You've successfully created your account. Now let's personalize your experience and get you started.",
		},
		{
			title: "Create Your First Wing",
			description: "Start building something amazing",
			icon: Zap,
			content: "Wings are the foundation of your work. Create your first wing to start organizing.",
		},
		{
			title: "Invite Your Flock",
			description: "Collaborate with others",
			icon: Users,
			content:
				"Add flock members, set permissions, and start collaborating in real-time in wings.",
		},
		{
			title: "You're All Set!",
			description: "Ready to launch",
			icon: CheckCircle2,
			content: "Everything is ready. Head to your dashboard to see your wings and start building.",
		},
	]

	const step = onboardingSteps[currentStep]
	const StepIcon = step.icon

	return (
		<main className="min-h-screen w-full bg-background text-foreground">
			<div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
				<div className="mb-8 flex items-center justify-between">
					<a href="#" className="inline-flex items-center gap-2 font-medium">
						<BrandIcon className="size-8" />
						<span>Cuervo Planner</span>
					</a>
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={handleToggleTheme}
						aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
					>
						{isDark ? (
							<SunIcon className="size-4" />
						) : (
							<MoonIcon className="size-4" />
						)}
					</Button>
				</div>

				<div className="mb-12 grid gap-8 md:grid-cols-2">
					{/* Progress Steps */}
					<div className="flex flex-col justify-between">
						<div>
							<h1 className="mb-2 text-3xl font-bold">Getting Started</h1>
							<p className="mb-8 text-muted-foreground">
								Step {currentStep + 1} of {onboardingSteps.length}
							</p>

							{/* Step Indicators */}
							<div className="space-y-4">
								{onboardingSteps.map((s, idx) => (
									<button
										key={idx}
										onClick={() => setCurrentStep(idx)}
										className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
											idx === currentStep
												? "border-primary bg-primary/5"
												: idx < currentStep
													? "border-green-500 bg-green-50 dark:bg-green-950/20"
													: "border-muted opacity-60"
										}`}
									>
										<div className="flex items-center gap-3">
											<div
												className={`flex size-6 items-center justify-center rounded-full border-2 ${
													idx < currentStep
														? "border-green-500 bg-green-500 text-white"
														: idx === currentStep
															? "border-primary bg-primary text-primary-foreground"
															: "border-muted"
												}`}
											>
												{idx < currentStep ? (
													<CheckCircle2 className="size-4" />
												) : (
													<span className="text-xs font-bold">{idx + 1}</span>
												)}
											</div>
											<div>
												<p className="text-sm font-medium">{s.title}</p>
												<p className="text-xs text-muted-foreground">{s.description}</p>
											</div>
										</div>
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Step Content */}
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
								<Button
									variant="outline"
									onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
									disabled={currentStep === 0}
									className="flex-1"
								>
									Back
								</Button>
								{currentStep === onboardingSteps.length - 1 ? (
									<Button className="flex-1" onClick={() => (window.location.href = "/dashboard")}>
										Go to Dashboard
										<ArrowRight className="ml-2 size-4" />
									</Button>
								) : (
									<Button
										className="flex-1"
										onClick={() => setCurrentStep(Math.min(onboardingSteps.length - 1, currentStep + 1))}
									>
										Next
										<ArrowRight className="ml-2 size-4" />
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				</div>

				<p className="text-center text-sm text-muted-foreground">
					Need help? <a href="#" className="text-primary hover:underline">View our guides</a>
				</p>
			</div>
		</main>
	)
}
