"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { backendFetch } from "@/lib/api/backend";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// Mirrors backend/app/services/pipeline_health.py
interface PipelineIssue {
  kind: "screening_failed" | "screening_stuck" | "evaluation_missing";
  application_id: string;
  hiring_post_id: string | null;
  job_title: string;
  candidate_name: string;
  session_id: string | null;
  occurred_at: string;
  detail: string;
}

const KIND_LABELS: Record<PipelineIssue["kind"], string> = {
  screening_failed: "Screening failed",
  screening_stuck: "Never screened",
  evaluation_missing: "Interview not evaluated",
};

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function getToken() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}

export function NeedsAttention() {
  const [issues, setIssues] = useState<PipelineIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Record<string, "pending" | "started" | "failed">>({});

  const load = useCallback(
    () =>
      getToken()
        .then((token) => backendFetch<{ items: PipelineIssue[] }>("/api/v1/pipeline/issues", { token }))
        .then((res) => {
          setIssues(res.items ?? []);
          setError(null);
        })
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "Failed to check for problems.")
        )
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(issue: PipelineIssue) {
    const key = issue.session_id ?? issue.application_id;
    setRetrying((r) => ({ ...r, [key]: "pending" }));
    try {
      const token = await getToken();
      if (issue.kind === "evaluation_missing") {
        await backendFetch("/api/v1/interview/evaluate", {
          method: "POST",
          // The candidate was already emailed when the interview ended.
          body: JSON.stringify({ session_id: issue.session_id, send_candidate_email: false }),
          token,
        });
      } else {
        await backendFetch("/api/v1/screening/trigger", {
          method: "POST",
          body: JSON.stringify({
            application_id: issue.application_id,
            hiring_post_id: issue.hiring_post_id,
          }),
          token,
        });
      }
      setRetrying((r) => ({ ...r, [key]: "started" }));
    } catch {
      setRetrying((r) => ({ ...r, [key]: "failed" }));
    }
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {issues.length > 0 ? (
            <AlertTriangle className="size-4 text-orange-600 dark:text-orange-400" />
          ) : (
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
          )}
          <CardTitle>Needs attention</CardTitle>
        </div>
        <CardDescription>
          {issues.length > 0
            ? "Candidates whose resume screening or interview evaluation failed or never ran. Admins are emailed hourly about new ones."
            : "No failed or stuck screenings or interview evaluations."}
        </CardDescription>
      </CardHeader>
      {(issues.length > 0 || error) && (
        <CardContent>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="divide-y">
            {issues.map((issue) => {
              const key = issue.session_id ?? issue.application_id;
              const state = retrying[key];
              return (
                <div key={`${issue.kind}:${key}`} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 mr-2">
                        {KIND_LABELS[issue.kind]}
                      </span>
                      <Link
                        href={`/candidates/${issue.application_id}`}
                        className="font-medium hover:underline"
                      >
                        {issue.candidate_name}
                      </Link>
                      <span className="text-muted-foreground"> · {issue.job_title}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground break-words">
                      {issue.detail} ({formatRelativeTime(issue.occurred_at)})
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {state === "started" ? (
                      <span className="text-xs text-muted-foreground">Retry started</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={state === "pending"}
                        onClick={() => retry(issue)}
                      >
                        {state === "failed" ? "Retry failed, try again" : state === "pending" ? "Retrying..." : "Retry"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
