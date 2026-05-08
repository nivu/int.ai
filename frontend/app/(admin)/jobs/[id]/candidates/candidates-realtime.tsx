"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CandidateTable, {
  type ApplicationRecord,
} from "@/components/admin/candidate-table";

interface CandidatesRealtimeProps {
  initialData: ApplicationRecord[];
  hiringPostId: string;
}

export default function CandidatesRealtime({
  initialData,
  hiringPostId,
}: CandidatesRealtimeProps) {
  const [data, setData] = useState<ApplicationRecord[]>(initialData);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`applications:${hiringPostId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `hiring_post_id=eq.${hiringPostId}`,
        },
        async (payload) => {
          const updated = payload.new as Record<string, unknown>;
          // Re-fetch the full record with joins so resume_data (breakdown details) is fresh
          const { data: fullApp } = await supabase
            .from("applications")
            .select("*, candidate:candidates(*), resume_data:resume_data(*)")
            .eq("id", updated.id as string)
            .single();

          if (fullApp) {
            setData((prev) =>
              prev.map((app) =>
                app.id === updated.id
                  ? (fullApp as unknown as ApplicationRecord)
                  : app,
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "applications",
          filter: `hiring_post_id=eq.${hiringPostId}`,
        },
        async (payload) => {
          // Fetch the full record with joins for a new application
          const newApp = payload.new as Record<string, unknown>;
          const { data: fullApp } = await supabase
            .from("applications")
            .select(
              "*, candidate:candidates(*), resume_data:resume_data(*)",
            )
            .eq("id", newApp.id as string)
            .single();

          if (fullApp) {
            setData((prev) => [fullApp as unknown as ApplicationRecord, ...prev]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hiringPostId]);

  return (
    <div className="space-y-4">
      <CandidateTable data={data} hiringPostId={hiringPostId} />
    </div>
  );
}
