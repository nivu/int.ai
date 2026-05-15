"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CandidateTable, {
  type ApplicationRecord,
} from "@/components/admin/candidate-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

interface CandidatesAllClientProps {
  applications: ApplicationRecord[];
  jobs: { id: string; title: string }[];
}

export default function CandidatesAllClient({
  applications,
  jobs,
}: CandidatesAllClientProps) {
  const [data, setData] = useState<ApplicationRecord[]>(applications);
  const [jobFilter, setJobFilter] = useState<string>("all");

  // Stable set of job IDs for this org — used to filter incoming realtime events
  const jobIdsRef = useRef(new Set(jobs.map((j) => j.id)));

  useEffect(() => {
    const supabase = createClient();
    const jobIds = jobIdsRef.current;

    const channel = supabase
      .channel("applications:all-candidates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "applications" },
        async (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as Record<string, unknown>;
          // Ignore applications that don't belong to this org's jobs
          if (!jobIds.has(updated.hiring_post_id as string)) return;

          const { data: fullApp } = await supabase
            .from("applications")
            .select(
              "*, candidate:candidates(*), resume_data:resume_data(*), hiring_post:hiring_posts(id, title)",
            )
            .eq("id", updated.id as string)
            .single();

          if (fullApp) {
            setData((prev) =>
              prev.map((app) =>
                app.id === updated.id
                  ? (fullApp as unknown as ApplicationRecord)
                  : app,
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "applications" },
        async (payload: { new: Record<string, unknown> }) => {
          const newApp = payload.new as Record<string, unknown>;
          if (!jobIds.has(newApp.hiring_post_id as string)) return;

          const { data: fullApp } = await supabase
            .from("applications")
            .select(
              "*, candidate:candidates(*), resume_data:resume_data(*), hiring_post:hiring_posts(id, title)",
            )
            .eq("id", newApp.id as string)
            .single();

          if (fullApp) {
            setData((prev) => [fullApp as unknown as ApplicationRecord, ...prev]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    if (jobFilter === "all") return data;
    return data.filter((a) => a.hiring_post_id === jobFilter);
  }, [data, jobFilter]);

  return (
    <div className="space-y-4">
      {/* Job filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">
          Filter by job:
        </label>
        <Select value={jobFilter} onValueChange={(value) => setJobFilter(value ?? "all")}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="All jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jobs</SelectItem>
            {jobs.map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table — no hiringPostId so the Job column will be shown */}
      <CandidateTable data={filtered} />
    </div>
  );
}
