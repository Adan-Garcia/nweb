import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	BookOpen,
	MoonIcon,
	ShieldCheck,
	SunIcon,
	Wrench,
	Workflow,
} from "lucide-react"
import { BrandIcon } from "@/components/brand-icon"
import { useThemeMode } from "@/hooks/use-theme-mode"

export function DocumentationPage() {
	const { isDark, toggleTheme: handleToggleTheme } = useThemeMode()

	const hierarchy = [
		{
			name: "Wing",
			description: "Workspace and profile container for one owner and invited members.",
		},
		{
			name: "Flight",
			description: "Academic term grouping by season and year for timeline-first organization.",
		},
		{
			name: "Branch",
			description: "Course-level container that keeps class notes, tasks, and labels together.",
		},
		{
			name: "Nest",
			description: "Flexible tags for units, assignment types, and custom user workflows.",
		},
		{
			name: "Twig & Feather",
			description: "Twigs are tasks, feathers are markdown notes connected to each class.",
		},
	]

	const buildRoadmap = [
		{
			area: "Core Application",
			items: [
				"Zustand split stores for UI state and event data",
				"Strict TypeScript interfaces for encrypted and decrypted payloads",
				"Drag and drop calendar and kanban with @dnd-kit",
			],
		},
		{
			area: "Real-time Sync",
			items: [
				"Supabase Postgres and realtime subscriptions",
				"Optimistic concurrency control with field-level merge strategy",
				"Offline persistence for decrypted local state",
			],
		},
		{
			area: "Encryption and Sharing",
			items: [
				"Per-course and per-note AES-GCM data keys",
				"Public-key key exchange for secure collaboration",
				"Server and client revocation strategy for roster changes",
			],
		},
	]

	return (
		<main className="min-h-screen w-full bg-background text-foreground">
			<header className="border-b border-border bg-card/50 backdrop-blur-sm">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
					<a href="/" className="inline-flex items-center gap-2 font-semibold">
						<BrandIcon className="size-8" />
						<span>Cuervo Planner</span>
					</a>

					<nav className="hidden items-center gap-8 md:flex">
						<a href="/" className="text-sm font-medium text-foreground hover:text-primary">
							About
						</a>
						<a href="/documentation" className="text-sm font-medium text-primary">
							Documentation
						</a>
						<a href="/pricing" className="text-sm font-medium text-foreground hover:text-primary">
							Pricing
						</a>
						<a href="/privacy" className="text-sm font-medium text-foreground hover:text-primary">
							Privacy
						</a>
					</nav>

					<Button
						variant="ghost"
						size="icon"
						onClick={handleToggleTheme}
						aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
					>
						{isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
					</Button>
				</div>
			</header>

			<div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
				<div className="mb-10 text-left">
					<p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						<BookOpen className="size-3.5" />
						Product Documentation
					</p>
					<h1 className="mb-3 text-4xl font-bold sm:text-5xl">Build with the same structure as your study flow</h1>
					<p className="max-w-3xl text-base text-muted-foreground sm:text-lg">
						This guide mirrors the planner model shown in the app and combines your current implementation roadmap so new contributors can onboard quickly.
					</p>
				</div>

				<div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{hierarchy.map((level) => (
						<Card key={level.name} className="text-left transition-all hover:border-primary/60 hover:shadow-md">
							<CardHeader>
								<CardTitle className="text-lg">{level.name}</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">{level.description}</p>
							</CardContent>
						</Card>
					))}
				</div>

				<div className="grid gap-5 lg:grid-cols-3">
					{buildRoadmap.map((section) => (
						<Card key={section.area} className="text-left">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-xl">
									{section.area === "Core Application" ? (
										<Workflow className="size-5 text-primary" />
									) : section.area === "Real-time Sync" ? (
										<Wrench className="size-5 text-primary" />
									) : (
										<ShieldCheck className="size-5 text-primary" />
									)}
									{section.area}
								</CardTitle>
								<CardDescription>Prioritized from your current Todo roadmap.</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="space-y-3 text-sm text-muted-foreground">
									{section.items.map((item) => (
										<li key={item} className="rounded-md border border-border/70 bg-card/70 px-3 py-2">
											{item}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</main>
	)
}
