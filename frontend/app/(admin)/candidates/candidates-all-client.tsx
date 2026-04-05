"use client";

import { useMemo, useState } from "react";
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

interface CandidatesAllClientProps {
  applications: ApplicationRecord[];
  jobs: { id: string; title: string }[];
}

export default function CandidatesAllClient({
  applications,
  jobs,
}: CandidatesAllClientProps) {
  const [jobFilter, setJobFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (jobFilter === "all") return applications;
    return applications.filter((a) => a.hiring_post_id === jobFilter);
  }, [applications, jobFilter]);

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
