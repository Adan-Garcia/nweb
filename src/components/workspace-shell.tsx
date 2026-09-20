import * as React from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"

type WorkspaceShellProps = {
	children: React.ReactNode
	isDark: boolean
	onToggleTheme: () => void
}

export function WorkspaceShell({ children, isDark, onToggleTheme }: WorkspaceShellProps) {
	return (
		<SidebarProvider >
			<WorkspaceSidebar isDark={isDark} onToggleTheme={onToggleTheme} />
			<SidebarInset>
				<div className="min-h-svh bg-background text-foreground">
					<div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur md:hidden sm:px-6 lg:px-8">
						<SidebarTrigger />
						<div>
							<p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
								Workspace
							</p>
						</div>
					</div>
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
