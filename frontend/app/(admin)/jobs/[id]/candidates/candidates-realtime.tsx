"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { backendFetch } from "@/lib/api/backend";
import { Button } from "@/components/ui/button";
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

  // ---- Manual screening trigger ----
  const [screeningIds, setScreeningIds] = useState<Set<string>>(new Set());

  async function handleRunScreening(applicationId: string) {
    setScreeningIds((prev) => new Set(prev).add(applicationId));
    try {
      await backendFetch("/api/v1/screening/trigger", {
        method: "POST",
        body: JSON.stringify({
          application_id: applicationId,
          hiring_post_id: hiringPostId,
        }),
      });
    } catch (err) {
      console.error("Failed to trigger screening:", err);
    } finally {
      setScreeningIds((prev) => {
        const next = new Set(prev);
        next.delete(applicationId);
        return next;
      });
    }
  }

  const appliedApps = data.filter((app) => app.status === "applied");

  return (
    <div className="space-y-4">
      {appliedApps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium mr-2">
            {appliedApps.length} unscreened application{appliedApps.length !== 1 ? "s" : ""}
          </span>
          {appliedApps.map((app) => (
            <Button
              key={app.id}
              size="sm"
              variant="outline"
              disabled={screeningIds.has(app.id)}
              onClick={() => handleRunScreening(app.id)}
            >
              {screeningIds.has(app.id)
                ? "Screening..."
                : `Screen ${app.candidate?.full_name ?? "Candidate"}`}
            </Button>
          ))}
        </div>
      )}
      <CandidateTable data={data} hiringPostId={hiringPostId} />
    </div>
  );
}
