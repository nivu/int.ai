import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Dashboard (server component)
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Get org_id
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = profile?.org_id;

  // ---- Fetch stats in parallel ----

  const activePostsQuery = supabase
    .from("hiring_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  const pendingScreeningQuery = supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "applied");

  const pendingInterviewsQuery = supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "interview_scheduled");

  const shortlistedQuery = supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "shortlisted");

  // Apply org filter if available
  if (orgId) {
    activePostsQuery.eq("org_id", orgId);
  }

  const [
    { count: activePostsCount },
    { count: pendingScreeningCount },
    { count: pendingInterviewsCount },
    { count: shortlistedCount },
  ] = await Promise.all([
    activePostsQuery,
    pendingScreeningQuery,
    pendingInterviewsQuery,
    shortlistedQuery,
  ]);

  // ---- Recent applications ----

  const { data: recentApplications } = await supabase
    .from("applications")
    .select(
      "id, created_at, candidates(full_name), hiring_posts(title)",
    )
    .order("created_at", { ascending: false })
    .limit(5);

  // ---- Stats cards data ----

  const stats = [
    {
      title: "Active Jobs",
      count: activePostsCount ?? 0,
      href: "/jobs?status=published",
    },
    {
      title: "Pending Screening",
      count: pendingScreeningCount ?? 0,
      href: "/candidates",
    },
    {
      title: "Interviews Pending",
      count: pendingInterviewsCount ?? 0,
      href: "/candidates",
    },
    {
      title: "Shortlisted",
      count: shortlistedCount ?? 0,
      href: "/candidates",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your hiring pipeline
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="hover:ring-2 hover:ring-primary/20 transition-shadow">
              <CardHeader>
                <CardDescription>{stat.title}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {stat.count}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Applications</CardTitle>
          <CardDescription>Last 5 applications received</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentApplications || recentApplications.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              No applications yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentApplications.map((app: Record<string, unknown>) => {
                const candidate = app.candidates as
                  | { full_name: string }
                  | null;
                const job = app.hiring_posts as { title: string } | null;

                return (
                  <div
                    key={app.id as string}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">
                        {candidate?.full_name ?? "Unknown Candidate"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Applied for{" "}
                        <span className="font-medium text-foreground">
                          {job?.title ?? "Unknown Job"}
                        </span>
                      </p>
                    </div>
                    <Badge variant="outline">
                      {formatRelativeTime(app.created_at as string)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
