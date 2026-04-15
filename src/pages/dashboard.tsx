import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	GalleryVerticalEndIcon,
	MoonIcon,
	SunIcon,
	Plus,
	MoreHorizontal,
	FolderOpen,
	Users,
	Settings,
	LogOut,
	Bell,
} from "lucide-react"
import { useEffect, useState } from "react"
import "../App.css"

export function DashBoardPage() {
	const [isDark, setIsDark] = useState(false)

	useEffect(() => {
		const savedTheme = window.localStorage.getItem("theme")
		const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
		const shouldUseDark = savedTheme === "dark" || (!savedTheme && prefersDark)

		setIsDark(shouldUseDark)
		document.documentElement.classList.toggle("dark", shouldUseDark)
	}, [])

	const handleToggleTheme = () => {
		const nextIsDark = !isDark
		setIsDark(nextIsDark)
		document.documentElement.classList.toggle("dark", nextIsDark)
		window.localStorage.setItem("theme", nextIsDark ? "dark" : "light")
	}

	const projects = [
		{
			id: 1,
			name: "Design System",
			description: "Building a scalable design system for the platform",
			members: 3,
			updated: "2 hours ago",
		},
		{
			id: 2,
			name: "Mobile App",
			description: "React Native mobile application",
			members: 5,
			updated: "1 day ago",
		},
		{
			id: 3,
			name: "Website Redesign",
			description: "New marketing website",
			members: 2,
			updated: "3 days ago",
		},
	]

	return (
		<main className="min-h-screen w-full bg-background text-foreground">
			{/* Header */}
			<header className="border-b border-border bg-card/50 backdrop-blur-sm">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
					<a href="#" className="inline-flex items-center gap-2 font-semibold">
						<div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
							<GalleryVerticalEndIcon className="size-5" />
						</div>
						<span>Cuervo Planner</span>
					</a>

					<nav className="hidden items-center gap-8 md:flex">
						<a href="#" className="text-sm font-medium text-foreground hover:text-primary">
							Browse
						</a>
						<a href="#" className="text-sm font-medium text-foreground hover:text-primary">
							Documentation
						</a>
						<a href="#" className="text-sm font-medium text-foreground hover:text-primary">
							Community
						</a>
					</nav>

					<div className="flex items-center gap-4">
						<Button
							variant="ghost"
							size="icon"
							onClick={handleToggleTheme}
							aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
						>
							{isDark ? (
								<SunIcon className="size-4" />
							) : (
								<MoonIcon className="size-4" />
							)}
						</Button>

						<Button variant="ghost" size="icon">
							<Bell className="size-4" />
						</Button>

						<Button variant="ghost" size="icon">
							<Settings className="size-4" />
						</Button>

						<Button variant="outline" size="sm" type="button">
							<LogOut className="mr-2 size-4" />
							Sign Out
						</Button>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
				{/* Welcome Section */}
				<div className="mb-12">
					<div className="mb-8">
						<h1 className="mb-2 text-4xl font-bold">Welcome back, Jordan!</h1>
						<p className="text-lg text-muted-foreground">
							Here's what's happening with your projects today.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-3">
						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Active Projects</CardTitle>
								<FolderOpen className="size-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">3</div>
								<p className="text-xs text-muted-foreground">+1 from last week</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Team Members</CardTitle>
								<Users className="size-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">12</div>
								<p className="text-xs text-muted-foreground">Across all projects</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Updates</CardTitle>
								<Bell className="size-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">5</div>
								<p className="text-xs text-muted-foreground">This week</p>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Projects Section */}
				<div>
					<div className="mb-6 flex items-center justify-between">
						<div>
							<h2 className="text-2xl font-bold">Your Projects</h2>
							<p className="text-muted-foreground">Manage and collaborate on your projects</p>
						</div>
						<Button>
							<Plus className="mr-2 size-4" />
							New Project
						</Button>
					</div>

					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{projects.map((project) => (
							<Card key={project.id} className="transition-all hover:border-primary hover:shadow-md">
								<CardHeader>
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<CardTitle className="text-lg">{project.name}</CardTitle>
											<CardDescription className="mt-1">
												{project.description}
											</CardDescription>
										</div>
										<Button variant="ghost" size="icon" className="h-6 w-6">
											<MoreHorizontal className="size-4" />
										</Button>
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-3">
										<div className="flex items-center justify-between text-sm">
											<span className="text-muted-foreground">Team</span>
											<span className="font-medium">{project.members} members</span>
										</div>
										<div className="flex items-center justify-between text-sm">
											<span className="text-muted-foreground">Updated</span>
											<span className="font-medium">{project.updated}</span>
										</div>
										<Button className="mt-4 w-full" variant="outline">
											Open Project
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			</div>
		</main>
	)
}
