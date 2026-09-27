import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";

export function UnloggedPage() {
  return (
    <AuthLayout
      aside={
        <div className="grid max-w-[40ch] gap-3">
          <p className="text-caption font-medium tracking-wider text-muted-foreground uppercase">
            Early Access
          </p>
          <h1 className="text-display">Planning, notes and sharing, in one place</h1>
          <p className="text-body text-muted-foreground">
            Everything you write is stored in this browser, and works offline. An account is
            optional: it syncs your devices and lets you share a course, and the server only ever
            holds what it cannot read. For more information, see our{" "}
            <a
              href="/privacy"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              privacy policy
            </a>
            .
          </p>
        </div>
      }
      formAriaLabel="Get started"
    >
      <div className="grid w-full max-w-sm gap-3">
        <h2 className="text-title">Get started</h2>
        <p className="text-body text-muted-foreground">
          Open the planner and start now, no account needed. To sync or share later, create an
          account from Settings → Account & sync.
        </p>
        <Button size="lg" nativeButton={false} render={<a href="/dashboard" />}>
          Open the planner
        </Button>
        <Button
          size="lg"
          variant="outline"
          type="button"
          onClick={() => (window.location.href = "/auth/signup")}
        >
          Signup Now
        </Button>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-body text-muted-foreground">
          Already have an account?
          <Button
            variant="link"
            size="sm"
            type="button"
            className="px-0"
            onClick={() => (window.location.href = "/auth/signin")}
          >
            Sign In
          </Button>
        </p>
      </div>
    </AuthLayout>
  );
}
