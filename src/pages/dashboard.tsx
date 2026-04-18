import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
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

import { WorkspaceShell } from "@/components/workspace-shell"
import { useThemeMode } from "@/hooks/use-theme-mode"

import "../App.css"

export function DashBoardPage() {
	const { isDark, toggleTheme } = useThemeMode()

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
		<WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
			<div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				<div className="mb-10">
					<div className="mb-8 flex flex-wrap items-start justify-between gap-4">
						<div>
							<p className="mb-2 text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
								Workspace overview
							</p>
							<h1 className="mb-2 text-4xl font-bold">Dashboard</h1>
							<p className="text-base text-muted-foreground">
								Here's what's happening with your projects today.
							</p>
						</div>
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

				<div>
					<div className="mb-6 flex items-center justify-between gap-4">
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
									<div className="flex items-start justify-between gap-4">
										<div className="flex-1">
											<CardTitle className="text-lg">{project.name}</CardTitle>
											<CardDescription className="mt-1">{project.description}</CardDescription>
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
		</WorkspaceShell>
	)
}