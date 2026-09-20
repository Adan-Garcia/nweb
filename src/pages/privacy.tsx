import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Database,
	KeyRound,
	MoonIcon,
	ShieldCheck,
	SunIcon,
	Users,
} from "lucide-react"
import { useThemeMode } from "@/hooks/use-theme-mode"
import { BrandIcon } from "@/components/brand-icon"

export function PrivacyPage() {
	const { isDark, toggleTheme: handleToggleTheme } = useThemeMode()

	const sections = [
		{
			title: "Data we collect",
			icon: <Database className="size-5 text-primary" />,
			items: [
				"Account information you provide, such as email and profile details.",
				"Planner content you create, including tasks, notes, labels, and collaboration metadata.",
				"Operational logs required to keep syncing and reliability working during the beta period.",
			],
		},
		{
			title: "How your data is protected",
			icon: <ShieldCheck className="size-5 text-primary" />,
			items: [
				"Data is designed to be encrypted before it is sent to backend services.",
				"Current architecture uses unique AES-GCM data encryption keys for courses and notes.",
				"Private keys remain on user devices, while only encrypted payloads and encrypted keys are stored remotely.",
                "Our code is 100% open-source, meaning our encryption methods and data practices can be independently verified by anyone."
            ],
		},
		{
			title: "Sharing and access control",
			icon: <Users className="size-5 text-primary" />,
			items: [
				"Shared workspaces use key exchange so collaborators can decrypt only the content they are invited to access.",
				"Server-side access is controlled with row-level policies.",
				"When collaboration membership changes, access revocation rules are applied and new keys may be rotated.",
			],
		},
		{
			title: "Storage, sync, and retention",
			icon: <KeyRound className="size-5 text-primary" />,
			items: [
				"Cuervo Planner is local-first and keeps decrypted state on your device for offline usage.",
				"Encrypted copies may be synchronized through supported cloud infrastructure to keep devices in sync.",
				"You can stop using the service at any time; self-hosting and local-first workflows remain a supported direction.",
			],
		},
	]

	const simpleBreakdown = [
		{
			step: "1",
			title: "You lock it on your device",
			copy: "Before your notes leave your device, they are scrambled into unreadable text.",
		},
		{
			step: "2",
			title: "Only your key can unlock it",
			copy: "The app needs your key to turn that scrambled text back into readable content.",
		},
		{
			step: "3",
			title: "No key means no reading",
			copy: "If someone gets the stored data but not your key, they only see encrypted gibberish.",
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
						<a href="/pricing" className="text-sm font-medium text-foreground hover:text-primary">
							Pricing
						</a>
						<a href="/privacy" className="text-sm font-medium text-primary">
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
				<div className="mx-auto mb-10 max-w-3xl text-left">
					<p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						<ShieldCheck className="size-3.5" />
						Privacy Policy
					</p>
					<h1 className="mb-3 text-4xl font-bold sm:text-5xl">Your study data stays yours</h1>
					<p className="text-base text-muted-foreground sm:text-lg">
						This policy explains how Cuervo Planner handles account information and study content during beta. The product is designed around local-first storage, encryption, and controlled sharing for collaborative coursework.
					</p>
					<p className="mt-3 text-sm text-muted-foreground">Last updated: April 15, 2026</p>
				</div>

				<div className="mb-8 rounded-xl border border-border bg-card/70 p-5 sm:p-6">
					<h2 className="mb-2 text-xl font-semibold">Privacy in plain language</h2>
					<p className="mb-4 text-sm text-muted-foreground sm:text-base">
						Short version: your data is encrypted first, and it cannot be read without your key.
					</p>
					<div className="grid gap-3 md:grid-cols-3">
						{simpleBreakdown.map((item) => (
							<div key={item.step} className="rounded-md border border-border/70 bg-background/60 p-4">
								<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Step {item.step}</p>
								<h3 className="mb-1 text-base font-semibold">{item.title}</h3>
								<p className="text-sm text-muted-foreground">{item.copy}</p>
							</div>
						))}
					</div>
				</div>

				<div className="grid gap-5 md:grid-cols-2">
					{sections.map((section) => (
						<Card key={section.title} className="text-left">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-xl">
									{section.icon}
									{section.title}
								</CardTitle>
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

				<div className="mt-8 rounded-xl border border-border bg-card/70 p-5 sm:p-6">
					<h2 className="mb-2 text-xl font-semibold">Your choices and contact</h2>
					<p className="text-sm text-muted-foreground sm:text-base">
						You can choose what you store, what you share, and where you run the app. If you have privacy questions or want data-related help, contact the project through the official Cuervo Planner support channels or repository issue tracker.
					</p>
				</div>
			</section>
		</main>
	)
}