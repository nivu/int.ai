import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  published: "default",
  closed: "destructive",
  archived: "outline",
};

interface ClientJob {
  id: string;
  title: string;
  department: string | null;
  location_type: string | null;
  location: string | null;
  status: string;
  created_at: string;
  applications: { count: number }[];
}

export default async function ClientHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS alone is not enough here: a client who is also a candidate can read
  // their own applied-to jobs, so only show the jobs granted to them.
  const { data } = await supabase.rpc("client_visible_post_ids");
  const ids = ((data ?? []) as unknown[]).map((v) =>
    typeof v === "object" && v !== null ? String(Object.values(v)[0]) : String(v),
  );

  let jobs: ClientJob[] = [];
  if (ids.length > 0) {
    const { data: posts } = await supabase
      .from("hiring_posts")
      .select("id,title,department,location_type,location,status,created_at,applications(count)")
      .in("id", ids)
      .order("created_at", { ascending: false });
    jobs = (posts ?? []) as ClientJob[];
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Shared jobs</h1>
      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No jobs have been shared with {user?.email}. If you expected access, contact the
            person who invited you.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/client/jobs/${job.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{job.title}</CardTitle>
                    <Badge variant={statusVariant[job.status] ?? "outline"}>{job.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    {job.department ? `${job.department} · ` : ""}
                    {job.location_type}
                    {job.location ? ` · ${job.location}` : ""}
                  </p>
                  <p>
                    {job.applications?.[0]?.count ?? 0} candidate
                    {(job.applications?.[0]?.count ?? 0) === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
