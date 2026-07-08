import { Skeleton } from "@/components/ui/skeleton";

function SectionCard({
  bodyRows = 3,
  hasMetrics = false,
  hasHeaderBadges = false,
}: {
  bodyRows?: number;
  hasHeaderBadges?: boolean;
  hasMetrics?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-col gap-4">
        {hasHeaderBadges ? (
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ) : null}
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-full max-w-2xl" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>

        {hasMetrics ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : null}

        <div className="grid gap-3">
          {Array.from({ length: bodyRows }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative flex size-9 items-center justify-center rounded-full border border-border bg-muted/40">
                <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Loading route</p>
                <p className="text-sm text-muted-foreground">
                  Pulling the latest engine-backed view.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <SectionCard bodyRows={3} hasHeaderBadges hasMetrics />
        <SectionCard bodyRows={4} />
      </div>

      <SectionCard bodyRows={3} hasHeaderBadges />
    </div>
  );
}
