import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HiringPost {
  id: string;
  title: string;
  department: string;
  status: "draft" | "published" | "closed" | "archived";
  created_at: string;
  application_count: number;
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const statusVariant: Record<
  HiringPost["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  published: "default",
  closed: "destructive",
  archived: "outline",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
    .from("user_profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = profile?.org_id;

  // Build query
  let query = supabase
    .from("hiring_posts")
    .select("id, title, department, status, created_at")
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

  const postsWithCounts: HiringPost[] = (jobs ?? []).map((j) => ({
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Title</th>
                      <th className="pb-2 pr-4 font-medium">Department</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Applications</th>
                      <th className="pb-2 pr-4 font-medium">Created</th>
                      <th className="pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postsWithCounts.map((job) => (
                      <tr key={job.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{job.title}</td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {job.department || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={statusVariant[job.status]}>
                            {job.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 tabular-nums">
                          {job.application_count}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatDate(job.created_at)}
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
            )}
          </CardContent>
        </Card>
      </div>
    </JobsRealtimeWrapper>
  );
}
