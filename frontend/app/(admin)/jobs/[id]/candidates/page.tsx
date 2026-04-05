import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CandidatesRealtime from "./candidates-realtime";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Server component — candidates for a specific hiring post
// ---------------------------------------------------------------------------

export default async function JobCandidatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch the hiring post for the header
  const { data: post, error: postError } = await supabase
    .from("hiring_posts")
    .select("id, title")
    .eq("id", id)
    .single();

  if (postError || !post) {
    notFound();
  }

  // Fetch applications with joined candidate and resume_data
  const { data: applications, error: appsError } = await supabase
    .from("applications")
    .select(
      "*, candidate:candidates(*), resume_data:resume_data(*)",
    )
    .eq("hiring_post_id", id)
    .order("overall_score", { ascending: false, nullsFirst: false });

  if (appsError) {
    console.error("Error fetching applications:", appsError);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/jobs" className="hover:underline">
              Jobs
            </Link>
            <span>/</span>
            <Link href={`/jobs/${id}`} className="hover:underline">
              {post.title}
            </Link>
            <span>/</span>
            <span>Candidates</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Candidates — {post.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {applications?.length ?? 0} applications
          </p>
        </div>
        <Link href={`/jobs/${id}`}>
          <Button variant="outline">Back to Job</Button>
        </Link>
      </div>

      {/* Candidate table with realtime updates */}
      <CandidatesRealtime
        initialData={applications ?? []}
        hiringPostId={id}
      />
    </div>
  );
}
