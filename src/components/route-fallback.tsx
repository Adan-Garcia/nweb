/** Shown while a lazily loaded page's code is being fetched. */
export function RouteFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <p role="status" className="text-sm text-muted-foreground">
        Loading...
      </p>
    </div>
  )
}
