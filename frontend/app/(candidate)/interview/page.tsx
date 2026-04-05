"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { backendFetch } from "@/lib/api/backend";
import { InterviewChecklist } from "@/components/candidate/interview-checklist";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface InterviewSession {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  deadline: string;
  consent_given_at: string | null;
  job: {
    title: string;
    company_name?: string;
  };
  template: {
    duration_minutes: number;
    question_count: number;
  };
}

interface CreateRoomResponse {
  token: string;
  server_url: string;
}

export default function InterviewPage() {
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    async function fetchPendingSession() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const now = new Date().toISOString();

        const { data, error: queryError } = await supabase
          .from("interview_sessions")
          .select(
            `
            id,
            job_id,
            candidate_id,
            status,
            deadline,
            consent_given_at,
            job:jobs!inner(title, company_name),
            template:interview_templates!inner(duration_minutes, question_count)
          `
          )
          .eq("candidate_id", user.id)
          .eq("status", "pending")
          .gt("deadline", now)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (queryError) throw queryError;
        setSession(data as unknown as InterviewSession | null);
      } catch {
        setError("Failed to load interview details. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchPendingSession();
  }, []);

  const handleReady = useCallback(async () => {
    if (!session) return;
    setStarting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const accessToken = authSession?.access_token;

      // Record consent
      await supabase
        .from("interview_sessions")
        .update({ consent_given_at: new Date().toISOString() })
        .eq("id", session.id);

      // Request LiveKit room token from backend
      const { token, server_url } = await backendFetch<CreateRoomResponse>(
        "/api/v1/interview/create-room",
        {
          method: "POST",
          token: accessToken ?? undefined,
          body: JSON.stringify({ session_id: session.id }),
        }
      );

      // Store in sessionStorage so the session page can pick it up
      sessionStorage.setItem(
        "interview_room",
        JSON.stringify({
          token,
          serverUrl: server_url,
          sessionId: session.id,
          maxQuestions: session.template.question_count,
          jobTitle: session.job.title,
        })
      );

      router.push("/interview/session");
    } catch {
      setError("Failed to start the interview. Please try again.");
      setStarting(false);
    }
  }, [session, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>No Interview Available</CardTitle>
          <CardDescription>
            You don&apos;t have any pending interviews at this time. If you
            believe this is an error, please contact the hiring team.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Interview details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{session.job.title}</CardTitle>
              {session.job.company_name && (
                <CardDescription>{session.job.company_name}</CardDescription>
              )}
            </div>
            <Badge variant="secondary">AI Interview</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Duration:</span>{" "}
              ~{session.template.duration_minutes} minutes
            </div>
            <div>
              <span className="font-medium text-foreground">Questions:</span>{" "}
              {session.template.question_count}
            </div>
            <div>
              <span className="font-medium text-foreground">Deadline:</span>{" "}
              {new Date(session.deadline).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checklist */}
      <InterviewChecklist
        duration={session.template.duration_minutes}
        onReady={handleReady}
      />

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Starting overlay */}
      {starting && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Setting up your interview room...
        </div>
      )}
    </div>
  );
}
