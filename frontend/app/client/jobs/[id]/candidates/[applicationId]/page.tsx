import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { statusConfig, type ApplicationStatus } from "@/components/admin/candidate-table";
import InterviewReportView from "@/components/admin/interview-report";
import ScoreDetailsClient from "@/app/(admin)/candidates/[id]/score-details/score-details-client";
import { ResumeSummary } from "@/components/client/resume-summary";

export default async function ClientCandidatePage({
  params,
}: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  const { id, applicationId } = await params;
  const supabase = await createClient();

  // Only granted jobs — never rely on RLS alone (candidate overlap).
  const { data } = await supabase.rpc("client_visible_post_ids");
  const ids = ((data ?? []) as unknown[]).map((v) =>
    typeof v === "object" && v !== null ? String(Object.values(v)[0]) : String(v),
  );
  if (!ids.includes(id)) notFound();

  const { data: application } = await supabase
    .from("applications")
    .select(
      "id,hiring_post_id,status,embedding_score,skill_match_score,experience_match_score,culture_match_score,overall_score,created_at,candidate:candidates(full_name,email,phone,current_role,current_company,years_experience,location,linkedin_url),hiring_posts(title,skill_cutoff,experience_cutoff,culture_cutoff)",
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (!application || application.hiring_post_id !== id) notFound();

  const { data: resumeData } = await supabase
    .from("resume_data")
    .select(
      "parsed_name,parsed_summary,parsed_skills,parsed_experience,parsed_education,resume_text,raw_markdown,skill_match_details,experience_match_details,culture_match_details",
    )
    .eq("application_id", applicationId)
    .maybeSingle();

  const { data: sessionRows } = await supabase.rpc("client_sessions_for_application", {
    p_application_id: applicationId,
  });
  const sessions = (sessionRows ?? []) as { id: string; status?: string }[];
  const sessionIds = sessions.map((s) => s.id);

  let qaItems: Record<string, unknown>[] = [];
  let reports: Record<string, unknown>[] = [];
  if (sessionIds.length > 0) {
    const { data: qaData } = await supabase
      .from("interview_qa")
      .select("*")
      .in("session_id", sessionIds)
      .order("created_at");
    qaItems = qaData ?? [];

    const { data: reportData } = await supabase
      .from("interview_reports")
      .select(
        "id,session_id,overall_grade,recommendation,summary,strengths,concerns,notable_responses,recommendation_detail,dimension_averages,created_at",
      )
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false });
    reports = reportData ?? [];
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const app = application as any;
  const candidate = app.candidate ?? null;
  const status = statusConfig[app.status as ApplicationStatus];

  return (
    <div className="space-y-6">
      <Link
        href={`/client/jobs/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to {app.hiring_posts?.title ?? "job"}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">
          {candidate?.full_name || resumeData?.parsed_name || "Candidate"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {app.hiring_posts?.title ?? "Unknown position"} &mdash;{" "}
          <Badge variant="secondary">{status?.label ?? app.status}</Badge>
        </p>
      </div>

      <Tabs defaultValue="resume">
        <TabsList>
          <TabsTrigger value="resume">Resume analysis</TabsTrigger>
          <TabsTrigger value="interview">Interview</TabsTrigger>
        </TabsList>

        <TabsContent value="resume">
          <div className="space-y-6">
            <ResumeSummary candidate={candidate} resumeData={resumeData as any} />
            <ScoreDetailsClient
              readOnly
              applicationId={applicationId}
              application={app}
              resumeData={resumeData as any}
            />
          </div>
        </TabsContent>

        <TabsContent value="interview">
          {sessions.length > 0 ? (
            <InterviewReportView
              readOnly
              report={(reports[0] ?? null) as any}
              reports={reports as any}
              sessions={sessions as any}
              qaItems={qaItems as any}
              audioUrl=""
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No interview yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
