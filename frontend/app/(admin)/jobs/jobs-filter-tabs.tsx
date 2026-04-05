"use client";

import { useRouter } from "next/navigation";
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

  return (
    <Tabs
      value={currentStatus ?? "all"}
      onValueChange={(val) => {
        const params = val === "all" ? "" : `?status=${val}`;
        router.push(`/jobs${params}`);
      }}
    >
      <TabsList>
        {statuses.map((s) => (
          <TabsTrigger key={s.value} value={s.value}>
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
