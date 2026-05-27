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
  status: string;
  deadline: string;
  consent_given_at: string | null;
  application: {
    id: string;
    candidate_id: string;
    hiring_post: {
      title: string;
      department: string | null;
    };
  };
  template: {
    max_duration_minutes: number;
    max_questions: number;
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
        // Read invite token from URL if present and persist it
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get("token");
        if (urlToken) {
          sessionStorage.setItem("invite_token", urlToken);
        }
        const inviteToken = sessionStorage.getItem("invite_token");

        let fetchOptions: RequestInit & { token?: string } = {};

        if (inviteToken) {
          fetchOptions = { headers: { "X-Invite-Token": inviteToken } };
        } else {
          const supabase = createClient();
          const {
            data: { session: authSession },
          } = await supabase.auth.getSession();
          if (!authSession?.access_token) {
            setLoading(false);
            return;
          }
          fetchOptions = { token: authSession.access_token };
        }

        const data = await backendFetch<InterviewSession>(
          "/api/v1/interview/my-session",
          fetchOptions
        );
        setSession(data);
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 403) {
          router.replace("/portal");
          return;
        } else if (status === 401) {
          router.replace("/auth/login");
          return;
        } else if (status === 502) {
          setError("Interview service is temporarily unavailable. Please try again shortly.");
          return;
        } else if (status !== 404) {
          setError("Failed to load interview details. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchPendingSession();
  }, [router]);

  const handleReady = useCallback(async () => {
    if (!session) return;
    setStarting(true);
    setError(null);

    try {
      const inviteToken = sessionStorage.getItem("invite_token");

      // Record consent via Supabase only for authenticated users;
      // invite-token users have consent recorded by the backend on room creation.
      if (!inviteToken) {
        const supabase = createClient();
        await supabase
          .from("interview_sessions")
          .update({ consent_given_at: new Date().toISOString() })
          .eq("id", session.id);
      }

      const supabase = createClient();
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const accessToken = authSession?.access_token;

      const { token, server_url } = await backendFetch<CreateRoomResponse>(
        "/api/v1/interview/create-room",
        {
          method: "POST",
          token: accessToken ?? undefined,
          body: JSON.stringify({ session_id: session.id }),
        }
      );

      sessionStorage.setItem(
        "interview_room",
        JSON.stringify({
          token,
          serverUrl: server_url,
          sessionId: session.id,
          maxQuestions: session.template.max_questions,
          jobTitle: session.application.hiring_post.title,
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

  const isInAppBrowser =
    typeof navigator !== "undefined" &&
    /Instagram|FBAN|FBAV|Twitter|LinkedInApp|GSA|Line\//.test(navigator.userAgent);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {isInAppBrowser && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <strong>Open in your browser for best results.</strong> Tap the menu (⋮ or
          share icon) and choose &quot;Open in Chrome&quot; or &quot;Open in Safari&quot; before starting
          the interview.
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{session.application.hiring_post.title}</CardTitle>
              {session.application.hiring_post.department && (
                <CardDescription>{session.application.hiring_post.department}</CardDescription>
              )}
            </div>
            <Badge variant="secondary">AI Interview</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Duration:</span>{" "}
              ~{session.template.max_duration_minutes} minutes
            </div>
            <div>
              <span className="font-medium text-foreground">Questions:</span>{" "}
              {session.template.max_questions}
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

      <InterviewChecklist
        duration={session.template.max_duration_minutes}
        onReady={handleReady}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {starting && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Setting up your interview room...
        </div>
      )}
    </div>
  );
}
