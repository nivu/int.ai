import { Skeleton } from "@/components/shared/skeleton";

export default function ClientLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />

      {/* Content skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <Skeleton lines={2} />
          </div>
        ))}
      </div>
    </div>
  );
}
