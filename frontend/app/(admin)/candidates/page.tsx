import { createClient } from "@/lib/supabase/server";
import CandidatesAllClient from "./candidates-all-client";

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
    .from("user_profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = profile?.org_id;

  // Fetch all applications with joined candidate + resume_data + hiring_post
  let query = supabase
    .from("applications")
    .select(
      "*, candidate:candidates(*), resume_data:resume_data(*), hiring_post:hiring_posts(id, title)",
    )
    .order("overall_score", { ascending: false, nullsFirst: false });

  if (orgId) {
    // Filter by org through the hiring_posts relationship
    query = query.eq("hiring_post.org_id", orgId);
  }

  const { data: applications, error } = await query;

  if (error) {
    console.error("Error fetching applications:", error);
  }

  // Fetch hiring posts for the job filter dropdown
  let jobsQuery = supabase
    .from("hiring_posts")
    .select("id, title")
    .order("title");

  if (orgId) {
    jobsQuery = jobsQuery.eq("org_id", orgId);
  }

  const { data: jobs } = await jobsQuery;

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
