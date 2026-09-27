import { PageContainer } from "@/components/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/** The shape of a workspace page, shown while its code or its data is on the way. */
export function PageSkeleton() {
  return (
    <PageContainer>
      <div role="status" aria-label="Loading" className="grid gap-6">
        <div className="grid gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {["a", "b", "c", "d"].map((id) => (
            <Skeleton key={id} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    </PageContainer>
  );
}
