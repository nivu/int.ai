import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/shared/logout-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AuthErrorHandler } from "@/components/shared/auth-error-handler";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default async function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Link auth_user_id if the candidate is signed in via Supabase
  if (user) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      fetch(`${BACKEND_URL}/api/v1/interview/link-candidate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AuthErrorHandler />
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            int.ai
          </Link>
          <div className="flex items-center gap-2">
            {user && (
              <>
                <span className="text-sm text-muted-foreground">{user.email}</span>
                <LogoutButton className="text-sm text-muted-foreground hover:text-foreground transition-colors" />
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
