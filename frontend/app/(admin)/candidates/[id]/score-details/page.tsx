import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import ScoreDetailsClient from "./score-details-client";

export default async function ScoreDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: application, error } = await supabase
    .from("applications")
    .select("*, hiring_posts(*), candidate:candidates(*)")
    .eq("id", id)
    .single();

  if (error || !application) notFound();

  const { data: resumeData } = await supabase
    .from("resume_data")
    .select(
      "raw_markdown, parsed_name, parsed_skills, parsed_experience, parsed_summary, skill_match_details, experience_match_details, culture_match_details"
    )
    .eq("application_id", id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div className="flex items-center gap-3">
        <Link
          href={`/candidates/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to candidate
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Score Breakdown</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {resumeData?.parsed_name || application.candidate?.full_name} &mdash;{" "}
            {application.hiring_posts?.title ?? "Unknown position"}
          </p>
        </div>
      </div>

      <ScoreDetailsClient
        application={application}
        resumeData={resumeData}
        applicationId={id}
      />
    </div>
  );
}
