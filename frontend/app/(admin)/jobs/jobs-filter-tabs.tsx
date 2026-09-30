"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statuses = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "closed", label: "Closed" },
];

export default function JobsFilterTabs({
  currentStatus,
}: {
  currentStatus?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The tab the user just clicked. Shown as active immediately, before the
  // server has finished re-fetching the filtered list.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  // While the navigation is in flight, show the clicked tab as active.
  // Once it settles, the URL-derived status is the source of truth again.
  const activeStatus = isPending && pendingStatus ? pendingStatus : (currentStatus ?? "all");

  return (
    <div className="flex items-center gap-3">
      <Tabs
        value={activeStatus}
        onValueChange={(val) => {
          const next = String(val);
          setPendingStatus(next);
          const params = next === "all" ? "" : `?status=${next}`;
          startTransition(() => {
            router.push(`/jobs${params}`);
          });
        }}
      >
        <TabsList aria-busy={isPending}>
          {statuses.map((s) => (
            <TabsTrigger key={s.value} value={s.value} disabled={isPending}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {isPending && (
        <span
          role="status"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          Loading jobs...
        </span>
      )}
    </div>
  );
}
