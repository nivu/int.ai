import { createClient } from "@/lib/supabase/server";
import { ApplyPageClient } from "./client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ApplyPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: hiringPost, error } = await supabase
    .from("hiring_posts")
    .select("id, title, department, location, description, status, share_slug")
    .eq("share_slug", slug)
    .single();

  if (error || !hiringPost || hiringPost.status !== "published") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Position Unavailable
          </h1>
          <p className="mt-2 text-muted-foreground">
            This position is no longer accepting applications.
          </p>
        </div>
      </main>
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
