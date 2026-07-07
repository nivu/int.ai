import { createClient } from "@/lib/supabase/server";
import CandidatesAllClient from "./candidates-all-client";
import type { ApplicationRecord } from "@/components/admin/candidate-table";

// ---------------------------------------------------------------------------
// Server component — all candidates across all jobs for the org
// ---------------------------------------------------------------------------

export default async function AllCandidatesPage() {
  const supabase = await createClient();

  // Get current user's org_id
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("team_members")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = profile?.org_id;

  // Fetch this org's hiring post IDs so we can scope the applications query
  const { data: orgPosts } = orgId
    ? await supabase.from("hiring_posts").select("id").eq("org_id", orgId)
    : { data: null };
  const postIds = (orgPosts ?? []).map((p: { id: string }) => p.id);
  const hasPosts = postIds.length > 0;

  // Fetch all applications with joined candidate + resume_data + hiring_post
  let applications: ApplicationRecord[] = [];
  let jobs: { id: string; title: string }[] = [];

  if (hasPosts) {
    const { data: apps, error } = await supabase
      .from("applications")
      .select(
        "*, candidate:candidates(*), resume_data:resume_data(*), hiring_post:hiring_posts(id, title)",
      )
      .in("hiring_post_id", postIds)
      .order("overall_score", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("Error fetching applications:", error);
    }
    applications = (apps ?? []) as ApplicationRecord[];

    // Fetch hiring posts for the job filter dropdown
    const { data: jobsData } = await supabase
      .from("hiring_posts")
      .select("id, title")
      .in("id", postIds)
      .order("title");

    jobs = (jobsData ?? []) as { id: string; title: string }[];
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Candidates</h1>
        <p className="text-sm text-muted-foreground">
          View and manage candidates across all hiring posts
        </p>
      </div>

      {/* Client wrapper with job filter */}
      <CandidatesAllClient
        applications={applications ?? []}
        jobs={jobs ?? []}
      />
    </div>
  );
}
