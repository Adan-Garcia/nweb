import { PLAIN_LANGUAGE_STEPS } from "@/components/marketing/privacy-content"

export function PlainLanguageBreakdown({ intro }: { intro: string }) {
  return (
    <div className="mb-8 rounded-xl border border-border bg-card/70 p-5 sm:p-6">
      <h2 className="mb-2 text-xl font-semibold">Privacy in plain language</h2>
      <p className="mb-4 text-sm text-muted-foreground sm:text-base">{intro}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {PLAIN_LANGUAGE_STEPS.map((item) => (
          <div key={item.step} className="rounded-md border border-border/70 bg-background/60 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
              Step {item.step}
            </p>
            <h3 className="mb-1 text-base font-semibold">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.copy}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
