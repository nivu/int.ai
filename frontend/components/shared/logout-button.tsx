"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface LogoutButtonProps {
  className?: string;
  redirectTo?: string;
}

export default function LogoutButton({
  className,
  redirectTo = "/",
}: LogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(redirectTo);
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={
        className ??
        "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      }
    >
      Sign Out
    </button>
  );
}
