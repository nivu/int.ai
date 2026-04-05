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
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          setData((prev) =>
            prev.map((app) =>
              app.id === updated.id
                ? {
                    ...app,
                    status: (updated.status as ApplicationRecord["status"]) ?? app.status,
                    embedding_score:
                      (updated.embedding_score as number | null) ?? app.embedding_score,
                    skill_match_score:
                      (updated.skill_match_score as number | null) ??
                      app.skill_match_score,
                    experience_match_score:
                      (updated.experience_match_score as number | null) ??
                      app.experience_match_score,
                    culture_match_score:
                      (updated.culture_match_score as number | null) ??
                      app.culture_match_score,
                    overall_score:
                      (updated.overall_score as number | null) ?? app.overall_score,
                  }
                : app,
            ),
          );
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

  return <CandidateTable data={data} hiringPostId={hiringPostId} />;
}
