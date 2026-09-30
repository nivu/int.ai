"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SortableTh,
  useSortState,
  useSortedRows,
  type SortAccessors,
} from "@/components/shared/sortable-table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HiringPostRow {
  id: string;
  title: string;
  department: string;
  status: "draft" | "published" | "closed" | "archived";
  location_type: "remote" | "onsite" | "hybrid" | null;
  location: string | null;
  experience_min: number | null;
  experience_max: number | null;
  screening_threshold: number | null;
  created_at: string;
  published_at: string | null;
  closes_at: string | null;
  application_count: number;
}

type SortKey =
  | "title"
  | "department"
  | "status"
  | "location"
  | "experience"
  | "screening_threshold"
  | "application_count"
  | "created_at"
  | "published_at"
  | "closes_at";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const statusVariant: Record<
  HiringPostRow["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  published: "default",
  closed: "destructive",
  archived: "outline",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const locationTypeLabel: Record<string, string> = {
  remote: "Remote",
  onsite: "On-site",
  hybrid: "Hybrid",
};

function formatLocation(job: HiringPostRow) {
  const type = job.location_type ? locationTypeLabel[job.location_type] : null;
  if (type && job.location) return `${type} · ${job.location}`;
  return type ?? job.location ?? "—";
}

function formatExperience(job: HiringPostRow) {
  const { experience_min: min, experience_max: max } = job;
  if (min == null && max == null) return "—";
  if (min != null && max != null) return `${min}–${max} yrs`;
  if (min != null) return `${min}+ yrs`;
  return `up to ${max} yrs`;
}

function toTime(iso: string | null) {
  return iso ? Date.parse(iso) : null;
}

const SORT_ACCESSORS: SortAccessors<HiringPostRow, SortKey> = {
  title: (job) => job.title,
  department: (job) => job.department || null,
  status: (job) => job.status,
  location: (job) => (job.location_type || job.location ? formatLocation(job) : null),
  experience: (job) => job.experience_min ?? job.experience_max,
  screening_threshold: (job) => job.screening_threshold,
  application_count: (job) => job.application_count,
  created_at: (job) => toTime(job.created_at),
  published_at: (job) => toTime(job.published_at),
  closes_at: (job) => toTime(job.closes_at),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JobsTable({ jobs }: { jobs: HiringPostRow[] }) {
  const [sort, toggleSort] = useSortState<SortKey>({
    key: "created_at",
    direction: "desc",
  });
  const sortedJobs = useSortedRows(jobs, sort, SORT_ACCESSORS);

  const th = (label: string, key: SortKey) => (
    <SortableTh label={label} sortKey={key} sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {th("Title", "title")}
            {th("Department", "department")}
            {th("Status", "status")}
            {th("Location", "location")}
            {th("Experience", "experience")}
            {th("Threshold", "screening_threshold")}
            {th("Applications", "application_count")}
            {th("Created", "created_at")}
            {th("Published", "published_at")}
            {th("Closes", "closes_at")}
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedJobs.map((job) => (
            <tr key={job.id} className="border-b last:border-0">
              <td className="py-3 pr-4 font-medium">{job.title}</td>
              <td className="py-3 pr-4 text-muted-foreground">
                {job.department || "—"}
              </td>
              <td className="py-3 pr-4">
                <Badge variant={statusVariant[job.status]}>{job.status}</Badge>
              </td>
              <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                {formatLocation(job)}
              </td>
              <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                {formatExperience(job)}
              </td>
              <td className="py-3 pr-4 tabular-nums">
                {job.screening_threshold != null
                  ? `${job.screening_threshold}%`
                  : "—"}
              </td>
              <td className="py-3 pr-4 tabular-nums">{job.application_count}</td>
              <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                {formatDate(job.created_at)}
              </td>
              <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                {formatDate(job.published_at)}
              </td>
              <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                {formatDate(job.closes_at)}
              </td>
              <td className="py-3">
                <Link href={`/jobs/${job.id}`}>
                  <Button variant="outline" size="sm">
                    View
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
