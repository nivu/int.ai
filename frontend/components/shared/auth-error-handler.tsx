"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Listens for Supabase auth errors (e.g. invalid/expired refresh token) and
 * redirects to login. Supabase emits SIGNED_OUT when a token refresh fails,
 * so we intercept that event before it surfaces as a console AuthApiError.
 */
export function AuthErrorHandler() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_OUT") {
        const isCandidate =
          window.location.pathname.startsWith("/portal") ||
          window.location.pathname.startsWith("/interview");
        router.replace(isCandidate ? "/auth/login?type=candidate" : "/auth/login");
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
