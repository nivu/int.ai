import { createAnonClient } from "@/lib/supabase/anon";
import { ApplyPageClient } from "./client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function isPast(timestamp: string | null): boolean {
  return timestamp != null && new Date(timestamp).getTime() < Date.now();
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}

export default async function ApplyPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAnonClient();

  // Closed jobs are not readable anonymously; this returns only title + open flag.
  const { data: statusRows, error: statusError } = await supabase.rpc("public_job_status", {
    p_slug: slug,
  });
  const jobStatus = statusRows?.[0] as { title: string; is_open: boolean } | undefined;

  // If the lookup itself failed, fall through to the direct read below.
  if (!statusError && !jobStatus) {
    return (
      <Notice
        title="Job not found"
        message="This link does not match an open position. Please check the link and try again."
      />
    );
  }

  if (jobStatus && !jobStatus.is_open) {
    return (
      <Notice
        title="This job has been closed"
        message={`${jobStatus.title} is no longer accepting applications. Thank you for your interest.`}
      />
    );
  }

  const { data: hiringPost, error } = await supabase
    .from("hiring_posts")
    .select("id, title, department, location, description, status, share_slug, closes_at")
    .eq("share_slug", slug)
    .single();

  if (error || !hiringPost || hiringPost.status !== "published" || isPast(hiringPost.closes_at)) {
    return (
      <Notice
        title="This job has been closed"
        message="This position is no longer accepting applications. Thank you for your interest."
      />
    );
  }

  return (
    <ApplyPageClient
      hiringPost={{
        id: hiringPost.id,
        title: hiringPost.title,
        department: hiringPost.department,
        location: hiringPost.location,
        description: hiringPost.description,
        shareSlug: hiringPost.share_slug,
      }}
    />
  );
}
