import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import JobsFilterTabs from "./jobs-filter-tabs";
import JobsRealtimeWrapper from "./jobs-realtime-wrapper";
import JobsTable, { type HiringPostRow } from "./jobs-table";

// ---------------------------------------------------------------------------
// Page (server component)
// ---------------------------------------------------------------------------

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
  const supabase = await createClient();

  // Get current user's org_id
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch user profile to get org_id
  const { data: profile } = await supabase
    .from("team_members")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = profile?.org_id;

  // Build query
  let query = supabase
    .from("hiring_posts")
    .select(
      "id, title, department, status, location_type, location, experience_min, experience_max, screening_threshold, created_at, published_at, closes_at",
    )
    .order("created_at", { ascending: false });

  if (orgId) {
    query = query.eq("org_id", orgId);
  }

  if (
    filterStatus &&
    ["draft", "published", "closed", "archived"].includes(filterStatus)
  ) {
    query = query.eq("status", filterStatus);
  }

  const { data: jobs } = await query;

  // Fetch application counts per job
  const jobIds = (jobs ?? []).map((j) => j.id);
  let appCounts: Record<string, number> = {};

  if (jobIds.length > 0) {
    const { data: counts } = await supabase
      .from("applications")
      .select("hiring_post_id")
      .in("hiring_post_id", jobIds);

    if (counts) {
      appCounts = counts.reduce(
        (acc, row) => {
          acc[row.hiring_post_id] = (acc[row.hiring_post_id] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
    }
  }

  const postsWithCounts: HiringPostRow[] = (jobs ?? []).map((j) => ({
    ...j,
    application_count: appCounts[j.id] ?? 0,
  }));

  return (
    <JobsRealtimeWrapper orgId={orgId ?? ""}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hiring Posts</h1>
            <p className="text-sm text-muted-foreground">
              Manage your open positions
            </p>
          </div>
          <Link href="/jobs/new">
            <Button>Create New Job</Button>
          </Link>
        </div>

        {/* Filters */}
        <JobsFilterTabs currentStatus={filterStatus} />

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Jobs</CardTitle>
            <CardAction>
              <span className="text-sm text-muted-foreground">
                {postsWithCounts.length} total
              </span>
            </CardAction>
          </CardHeader>
          <CardContent>
            {postsWithCounts.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No hiring posts found. Create your first job to get started.
              </p>
            ) : (
              <JobsTable jobs={postsWithCounts} />
            )}
          </CardContent>
        </Card>
      </div>
    </JobsRealtimeWrapper>
  );
}
