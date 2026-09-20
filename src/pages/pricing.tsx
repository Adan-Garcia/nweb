import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Check,
	MoonIcon,
	ShieldCheck,
	Sparkles,
	SunIcon,
	Zap,
} from "lucide-react"
import { useThemeMode } from "@/hooks/use-theme-mode"
import { BrandIcon } from "@/components/brand-icon"

export function PricingPage() {
	const { isDark, toggleTheme: handleToggleTheme } = useThemeMode()

	const tiers = [
		{
			name: "Beta",
			price: "$0",
			description: "Free access during the public beta through 2027.",
			highlight: true,
			features: [
				"Private-by-default planner",
				"Notes and homework organization",
				"Cross-platform sync-ready architecture",
                "All features are free forever",
                "Open Source on GitHub",
			],
			action: "Start for Free",
		},
		{
			name: "Flock Supporter",
			price: "$4 / month",
			description: "Help support the project and get access to less crowded servers",
			highlight: false,
			features: [
				"Supporter only servers with faster syncing",
				"Increased storage limits for notes and file attachments",
                "Faster support response times"
			],
			action: "Comming Soon",
		},
		{
			name: "Flock Teams",
			price: "$12 / month",
			description: "Built for study groups and classes using secure key exchange.",
			highlight: false,
			features: [
				"Private Servers for teams",
				"Frequent Cloud backups",
				"Faster support response times",
			],
			action: "Comming Soon",
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
						<a href="/documentation" className="text-sm font-medium text-foreground hover:text-primary">
							Documentation
						</a>
						<a href="/pricing" className="text-sm font-medium text-primary">
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

			<section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
				<div className="mx-auto mb-10 max-w-3xl text-center">
					<p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						<Sparkles className="size-3.5" />
						Simple and transparent
					</p>
					<h1 className="mb-3 text-4xl font-bold sm:text-5xl">Pricing that scales from solo study to team collaboration</h1>
					<p className="text-base text-muted-foreground sm:text-lg">
						The current launch includes a free beta. Dependent on user feedback and demand, we may introduce paid plans in the future to support the project and provide access to faster servers and priority support, but the core planner and all features will remain free and open source on GitHub.
        if the service becomes popular enough the paid plans will help support the continuation of the free offering, but if not the product will continue to be free and open source with no feature restrictions for self-hosting and local-first use.
                    </p>
				</div>

				<div className="grid gap-5 lg:grid-cols-3">
					{tiers.map((tier) => (
						<Card
							key={tier.name}
							className={`text-left ${tier.highlight ? "border-primary shadow-lg shadow-primary/10" : ""}`}
						>
							<CardHeader>
								<div className="mb-2 flex items-center justify-between">
									<CardTitle className="text-2xl">{tier.name}</CardTitle>
									{tier.highlight ? (
										<span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
											<Zap className="mr-1 size-3.5" />
											Most Popular
										</span>
									) : null}
								</div>
								<p className="mb-1 text-3xl font-bold text-foreground">{tier.price}</p>
								<CardDescription>{tier.description}</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="mb-6 space-y-3 text-sm text-muted-foreground">
									{tier.features.map((feature) => (
										<li key={feature} className="flex items-start gap-2">
											<Check className="mt-0.5 size-4 text-primary" />
											<span>{feature}</span>
										</li>
									))}
								</ul>
								<Button className="w-full" variant={tier.highlight ? "default" : "outline"}>
									{tier.action}
								</Button>
							</CardContent>
						</Card>
					))}
				</div>

				<div className="mt-10 rounded-xl border border-border bg-card/70 p-5 text-left sm:p-6">
					<h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
						<ShieldCheck className="size-5 text-primary" />
						Security included on every tier
					</h2>
					<p className="text-sm text-muted-foreground sm:text-base">
						Every plan follows the same encryption-first model: local-first data handling, secure key management, and access control designed for shared academic workspaces.
					</p>
				</div>
                <div className="mt-10 rounded-xl border border-border bg-card/70 p-5 text-left sm:p-6">
                        <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
                            <ShieldCheck className="size-5 text-primary" />
                            Forever open source
                        </h2>
                        <p className="text-sm text-muted-foreground sm:text-base">
                            The core planner and all features will remain free and open source on GitHub, with paid plans supporting the project and providing access to faster servers and priority support. But the product will always support self-hosting and local-first use for students who prefer to keep their data private with no feature restrictions.
                        </p>
                    </div>
			</section>
		</main>
	)
}
