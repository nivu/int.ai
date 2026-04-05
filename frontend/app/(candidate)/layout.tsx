import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?type=candidate");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/portal" className="text-lg font-bold tracking-tight">
            int.ai
          </Link>
          <span className="text-sm text-muted-foreground">{user.email}</span>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
