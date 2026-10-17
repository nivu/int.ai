"use client";

import { Button } from "@/components/ui/button";
import { statusConfig, type ApplicationRecord } from "@/components/admin/candidate-table";
import { toCsv, downloadCsv } from "@/lib/csv";

function pct(score: number | null | undefined): number | null {
  return score == null ? null : Math.round(score * 100);
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "job"
  );
}

export function ExportCsvButton({
  rows,
  jobTitle,
}: {
  rows: ApplicationRecord[];
  jobTitle: string;
}) {
  function handleExport() {
    const headers = [
      "Name",
      "Email",
      "Phone",
      "Current role",
      "Current company",
      "Years experience",
      "Location",
      "LinkedIn",
      "Status",
      "Overall %",
      "Skill match %",
      "Experience match %",
      "Culture match %",
      "Top skills",
      "Applied",
    ];
    const data = rows.map((r) => [
      r.candidate?.full_name ?? "",
      r.candidate?.email ?? "",
      r.candidate?.phone ?? "",
      r.candidate?.current_role ?? "",
      r.candidate?.current_company ?? "",
      r.candidate?.years_experience ?? null,
      r.candidate?.location ?? "",
      r.candidate?.linkedin_url ?? "",
      statusConfig[r.status]?.label ?? r.status,
      pct(r.overall_score),
      pct(r.skill_match_score),
      pct(r.experience_match_score),
      pct(r.culture_match_score),
      (r.resume_data?.parsed_skills ?? []).slice(0, 10).join("; "),
      r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "",
    ]);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`${slug(jobTitle)}-candidates-${today}.csv`, toCsv(headers, data));
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
      Export CSV
    </Button>
  );
}
