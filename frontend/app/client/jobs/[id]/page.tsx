import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApplicationRecord } from "@/components/admin/candidate-table";
import ClientCandidates from "./client-candidates";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  published: "default",
  closed: "destructive",
  archived: "outline",
};

export default async function ClientJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Only granted jobs — never rely on RLS alone (candidate overlap).
  const { data } = await supabase.rpc("client_visible_post_ids");
  const ids = ((data ?? []) as unknown[]).map((v) =>
    typeof v === "object" && v !== null ? String(Object.values(v)[0]) : String(v),
  );
  if (!ids.includes(id)) notFound();

  const { data: post } = await supabase
    .from("hiring_posts")
    .select(
      "id,title,department,location_type,location,description,required_skills,experience_min,experience_max,status,skill_cutoff,experience_cutoff,culture_cutoff",
    )
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  const { data: applications } = await supabase
    .from("applications")
    .select(
      "id,hiring_post_id,candidate_id,status,embedding_score,skill_match_score,experience_match_score,culture_match_score,overall_score,created_at,candidate:candidates(id,full_name,email),resume_data:resume_data(parsed_summary,parsed_experience,parsed_skills,skill_match_details,experience_match_details,culture_match_details)",
    )
    .eq("hiring_post_id", id)
    .order("overall_score", { ascending: false, nullsFirst: false });

  return (
    <div className="space-y-6">
      <Link
        href="/client"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        All shared jobs
      </Link>

      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{post.title}</h1>
          <Badge variant={statusVariant[post.status] ?? "outline"}>{post.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {post.department ? `${post.department} · ` : ""}
          {post.location_type}
          {post.location ? ` · ${post.location}` : ""}
          {post.experience_min != null && post.experience_max != null
            ? ` · ${post.experience_min}–${post.experience_max} yrs`
            : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Description</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">
            {post.description || "No description provided."}
          </div>
        </CardContent>
      </Card>

      {post.required_skills && post.required_skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Required Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {(post.required_skills as string[]).map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ClientCandidates
        jobId={id}
        jobTitle={post.title}
        data={(applications ?? []) as unknown as ApplicationRecord[]}
      />
    </div>
  );
}
