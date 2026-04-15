import { AuthShell } from "@/components/auth-shell"
import { SignupForm } from "@/components/signup-form"
import { ShieldCheck, LockKeyhole } from "lucide-react"
import "../App.css"

export function SignupPage() {
	return (
		<AuthShell
			pageClassName="signin-page"
			shellClassName="signin-shell"
			brandClassName="signin-brand"
			copyClassName="signin-copy"
			formPanelClassName="signin-form-panel"
			formAriaLabel="Sign in form"
			eyebrow="Secure access"
			title="Pick up right where your notes and projects left off."
			description="Sign in to resume your encrypted workspace, keep your drafts in sync, and return to the same clean flow on every device."
			benefitsClassName="signin-points"
			benefitClassName="signin-point"
			benefitBadgeClassName="signin-point-badge"
			benefitTitleClassName="signin-point-title"
			benefitCopyClassName="signin-point-copy"
			benefits={[
				{
					icon: <ShieldCheck className="size-4" />,
					title: "Private by default",
					copy: "Your workspace stays locked to your account.",
				},
				{
					icon: <LockKeyhole className="size-4" />,
					title: "Fast recovery",
					copy: "Get back in quickly if you switch devices.",
				}
			]}
			form={<SignupForm className="signup-card" />}
		/>
	)
}
