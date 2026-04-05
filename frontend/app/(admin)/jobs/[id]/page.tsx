import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JobDetailClient from "./job-detail-client";

// ---------------------------------------------------------------------------
// Server component — fetches the hiring post and passes to client shell
// ---------------------------------------------------------------------------

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: post, error } = await supabase
    .from("hiring_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !post) {
    notFound();
  }

  // Application count
  const { count: applicationCount } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("hiring_post_id", id);

  return (
    <JobDetailClient
      post={post}
      applicationCount={applicationCount ?? 0}
    />
  );
}
