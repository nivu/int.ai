import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Briefcase, Users, ClipboardList, Star, Clock, TrendingUp } from "lucide-react";

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

const STATUS_LABELS: Record<string, string> = {
  applied: "Applied",
  screened: "Awaiting Review",
  interview_sent: "Interview Sent",
  interviewed: "Interviewed",
  shortlisted: "Shortlisted",
  hired: "Hired",
  resume_rejected: "Rejected",
  interview_rejected: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  screened: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  interview_sent: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  interviewed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  shortlisted: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  hired: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  resume_rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  interview_rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

// ---------------------------------------------------------------------------
// Dashboard (server component)
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Resolve org from team_members
  const { data: member } = await supabase
    .from("team_members")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = member?.org_id ?? null;

  // Fetch this org's published hiring post IDs to scope application queries
  let orgPostIds: string[] = [];
  if (orgId) {
    const { data: posts } = await supabase
      .from("hiring_posts")
      .select("id")
      .eq("org_id", orgId);
    orgPostIds = (posts ?? []).map((p: { id: string }) => p.id);
  }

  // ---- Count queries ----

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();
  const scope = orgPostIds.length > 0;

  const [
    { count: activePostsCount },
    { count: totalCandidatesCount },
    { count: pendingScreeningCount },
    { count: awaitingReviewCount },
    { count: interviewSentCount },
    { count: shortlistedCount },
    { count: todayCount },
  ] = await Promise.all([
    // Active published job posts
    orgId
      ? supabase.from("hiring_posts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "published")
      : supabase.from("hiring_posts").select("id", { count: "exact", head: true }).eq("status", "published"),

    // Total applicants
    scope
      ? supabase.from("applications").select("id", { count: "exact", head: true }).in("hiring_post_id", orgPostIds)
      : supabase.from("applications").select("id", { count: "exact", head: true }),

    // Submitted but not yet screened (status = applied)
    scope
      ? supabase.from("applications").select("id", { count: "exact", head: true }).in("hiring_post_id", orgPostIds).eq("status", "applied")
      : supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "applied"),

    // AI-screened, awaiting recruiter review (status = screened)
    scope
      ? supabase.from("applications").select("id", { count: "exact", head: true }).in("hiring_post_id", orgPostIds).eq("status", "screened")
      : supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "screened"),

    // Interview invitation sent, candidate hasn't completed yet
    scope
      ? supabase.from("applications").select("id", { count: "exact", head: true }).in("hiring_post_id", orgPostIds).eq("status", "interview_sent")
      : supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "interview_sent"),

    // Shortlisted after interview
    scope
      ? supabase.from("applications").select("id", { count: "exact", head: true }).in("hiring_post_id", orgPostIds).eq("status", "shortlisted")
      : supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "shortlisted"),

    // Applied today
    scope
      ? supabase.from("applications").select("id", { count: "exact", head: true }).in("hiring_post_id", orgPostIds).gte("created_at", todayISO)
      : supabase.from("applications").select("id", { count: "exact", head: true }).gte("created_at", todayISO),
  ]);

  // ---- Recent applications ----
  const recentBase = supabase
    .from("applications")
    .select("id, status, overall_score, created_at, candidates(full_name), hiring_posts(title)")
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: recentRaw } = orgPostIds.length > 0
    ? await recentBase.in("hiring_post_id", orgPostIds)
    : await recentBase;

  const recentApplications = (recentRaw ?? []) as Array<{
    id: string;
    status: string;
    overall_score: number | null;
    created_at: string;
    candidates: { full_name: string }[] | { full_name: string } | null;
    hiring_posts: { title: string }[] | { title: string } | null;
  }>;

  // Supabase returns joined rows as arrays or objects depending on cardinality
  function getName(c: typeof recentApplications[0]["candidates"]): string {
    if (!c) return "Unknown Candidate";
    if (Array.isArray(c)) return c[0]?.full_name ?? "Unknown Candidate";
    return c.full_name;
  }
  function getTitle(h: typeof recentApplications[0]["hiring_posts"]): string {
    if (!h) return "Unknown Job";
    if (Array.isArray(h)) return h[0]?.title ?? "Unknown Job";
    return h.title;
  }

  // ---- Stats cards ----
  const stats = [
    {
      title: "Active Jobs",
      count: activePostsCount ?? 0,
      href: "/jobs",
      icon: Briefcase,
      description: "published job posts",
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Total Applicants",
      count: totalCandidatesCount ?? 0,
      href: "/candidates",
      icon: Users,
      description: `${todayCount ?? 0} applied today`,
      color: "text-indigo-600 dark:text-indigo-400",
    },
    {
      title: "Awaiting Review",
      count: awaitingReviewCount ?? 0,
      href: "/candidates",
      icon: ClipboardList,
      description: "AI-screened, needs decision",
      color: "text-yellow-600 dark:text-yellow-400",
    },
    {
      title: "Interviews Sent",
      count: interviewSentCount ?? 0,
      href: "/candidates",
      icon: Clock,
      description: "waiting for candidate",
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      title: "Shortlisted",
      count: shortlistedCount ?? 0,
      href: "/candidates",
      icon: Star,
      description: "passed interview round",
      color: "text-green-600 dark:text-green-400",
    },
    {
      title: "Unprocessed",
      count: pendingScreeningCount ?? 0,
      href: "/candidates",
      icon: TrendingUp,
      description: "submitted, not yet screened",
      color: "text-orange-600 dark:text-orange-400",
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

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} href={stat.href}>
              <Card className="hover:ring-2 hover:ring-primary/20 transition-shadow h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs font-medium uppercase tracking-wide">
                      {stat.title}
                    </CardDescription>
                    <Icon className={`size-4 ${stat.color}`} />
                  </div>
                  <CardTitle className="text-3xl tabular-nums mt-1">
                    {stat.count}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Recent applications */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Applications</CardTitle>
          <CardDescription>Latest 8 applications across all jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {recentApplications.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No applications yet.
            </p>
          ) : (
            <div className="divide-y">
              {recentApplications.map((app) => {
                const statusLabel = STATUS_LABELS[app.status] ?? app.status;
                const statusColor = STATUS_COLORS[app.status] ?? "bg-muted text-muted-foreground";

                return (
                  <Link
                    key={app.id}
                    href={`/candidates/${app.id}`}
                    className="flex items-center justify-between py-3 hover:bg-muted/40 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {getName(app.candidates)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {getTitle(app.hiring_posts)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      {app.overall_score != null && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {Math.round(app.overall_score * 100)}%
                        </span>
                      )}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(app.created_at)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
