import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CandidateDetailClient from "./candidate-detail-client";

// ---------------------------------------------------------------------------
// Server component — fetches all candidate-related data
// ---------------------------------------------------------------------------

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch the candidate (application record) with related hiring post
  const { data: application, error } = await supabase
    .from("applications")
    .select("*, hiring_posts(*), candidate:candidates(*)")
    .eq("id", id)
    .single();

  if (error || !application) {
    notFound();
  }

  // Fetch resume data
  const { data: resumeData } = await supabase
    .from("resume_data")
    .select("*")
    .eq("application_id", id)
    .maybeSingle();

  // Fetch interview sessions
  const { data: sessions } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("application_id", id)
    .order("created_at", { ascending: false });

  // Fetch interview Q&A for all sessions
  const sessionIds = (sessions ?? []).map((s) => s.id);
  let qaItems: Record<string, unknown>[] = [];
  if (sessionIds.length > 0) {
    const { data: qaData } = await supabase
      .from("interview_qa")
      .select("*")
      .in("session_id", sessionIds)
      .order("created_at");
    qaItems = qaData ?? [];
  }

  // Fetch interview reports
  let reports: Record<string, unknown>[] = [];
  if (sessionIds.length > 0) {
    const { data: reportData } = await supabase
      .from("interview_reports")
      .select("*")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false });
    reports = reportData ?? [];
  }

  return (
    <CandidateDetailClient
      application={application}
      resumeData={resumeData}
      sessions={sessions ?? []}
      qaItems={qaItems}
      reports={reports}
    />
  );
}
