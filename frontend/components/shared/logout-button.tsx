"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface LogoutButtonProps {
  className?: string;
}

export default function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
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
