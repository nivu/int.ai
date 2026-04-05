"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface JobsRealtimeWrapperProps {
  orgId: string;
  children: React.ReactNode;
}

export default function JobsRealtimeWrapper({
  orgId,
  children,
}: JobsRealtimeWrapperProps) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`hiring_posts:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hiring_posts",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "hiring_posts",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "hiring_posts",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return <>{children}</>;
}
