import { REPOSITORY_URL } from "@/components/marketing/marketing-nav";

/** Site footer: the repository link and licence that make the "Open Source" claim checkable. */
export function MarketingFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <p className="m-0">Cuervo Planner — free and open source under the MIT licence.</p>
        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}
