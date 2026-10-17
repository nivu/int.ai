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
        // Clear all stale Supabase tokens from localStorage so the dead
        // refresh token doesn't trigger the same error on the next page load.
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sb-")) localStorage.removeItem(key);
        });
        const path = window.location.pathname;
        if (path === "/client" || path.startsWith("/client/")) {
          router.replace("/auth/login?type=client");
          return;
        }
        const isCandidate =
          path.startsWith("/portal") ||
          path.startsWith("/interview");
        router.replace(isCandidate ? "/auth/login?type=candidate" : "/auth/login");
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
