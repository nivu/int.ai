import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/shared/logout-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AuthErrorHandler } from "@/components/shared/auth-error-handler";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login?type=client");
  }

  // Staff never use the client portal.
  const { data: staffRows } = await supabase
    .from("team_members")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if (staffRows && staffRows.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AuthErrorHandler />
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/client" className="text-lg font-bold tracking-tight">
            int.ai · Client access
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <ThemeToggle />
            <LogoutButton
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              redirectTo="/auth/login?type=client"
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
