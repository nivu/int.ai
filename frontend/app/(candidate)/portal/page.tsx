"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusTracker } from "@/components/candidate/status-tracker";
import type { ApplicationStatus } from "@/components/candidate/status-tracker";

interface InterviewSession {
  id: string;
  status: string;
  started_at: string;
}

interface Application {
  id: string;
  status: ApplicationStatus;
  created_at: string;
  interview_deadline: string | null;
  hiring_post: {
    id: string;
    title: string;
    department: string | null;
  } | null;
  interview_sessions?: InterviewSession[];
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isWithinDeadline(deadline: string | null): boolean {
  if (!deadline) return true;
  return new Date(deadline) > new Date();
}

export default function CandidatePortalPage() {
  const searchParams = useSearchParams();
  const sessionEnded = searchParams.get("session_ended") === "1";

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidateId, setCandidateId] = useState<string | null>(null);

  const supabase = createClient();

  const fetchApplications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Get candidate record — try by auth_user_id first, fall back to email
    let { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!candidate && user.email) {
      // Fallback: match by email and link the auth user
      const { data: byEmail } = await supabase
        .from("candidates")
        .select("id")
        .eq("email", user.email)
        .single();
      candidate = byEmail;
    }

    if (!candidate) {
      setLoading(false);
      return;
    }

    setCandidateId(candidate.id);

    // Fetch applications with hiring post info AND interview sessions
    const { data: apps } = await supabase
      .from("applications")
      .select(
        `
        id,
        status,
        created_at,
        interview_deadline,
        hiring_post:hiring_posts (
          id,
          title,
          department
        ),
        interview_sessions (
          id,
          status,
          started_at
        )
      `
      )
      .eq("candidate_id", candidate.id)
      .order("created_at", { ascending: false });

    if (apps) {
      setApplications(apps as unknown as Application[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApplications();
  }, [fetchApplications]);

  // Realtime subscription (T067)
  useEffect(() => {
    if (!candidateId) return;

    const channel = supabase
      .channel("my-applications")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `candidate_id=eq.${candidateId}`,
        },
        () => {
          fetchApplications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [candidateId, supabase, fetchApplications]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 text-4xl text-muted-foreground/40">--</div>
        <h2 className="text-lg font-medium">No applications found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          When you apply to positions, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sessionEnded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Your interview session is no longer active. If you believe this was a mistake, please contact the hiring team.
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Applications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track the progress of your applications in real time.
        </p>
      </div>

      <div className="space-y-4">
        {applications.map((app) => {
          const jobTitle = app.hiring_post?.title ?? "Untitled Position";
          const company = app.hiring_post?.department ?? "General";
          
          // Check if any interview session exists for this application
          const hasSession = (app.interview_sessions?.length ?? 0) > 0;
          const latestSession = app.interview_sessions?.[0];
          
          // Per spec: Once a session starts, candidate can NEVER restart
          // Show button ONLY if: invited/sent status, within deadline, AND no session exists
          const showInterviewButton =
            (app.status === "interview_invited" || app.status === "interview_sent") &&
            isWithinDeadline(app.interview_deadline) &&
            !hasSession;
          
          // Determine status message if session exists
          let sessionMessage = "";
          if (hasSession && latestSession) {
            if (latestSession.status === "completed") {
              sessionMessage = "Interview completed";
            } else if (latestSession.status === "terminated_tab_switch") {
              sessionMessage = "Interview terminated due to tab switch violation";
            } else if (latestSession.status === "terminated_abandoned") {
              sessionMessage = "Interview session ended";
            } else if (latestSession.status === "in_progress") {
              sessionMessage = "Interview in progress";
            } else {
              sessionMessage = "Interview session exists";
            }
          }

          return (
            <Card key={app.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{jobTitle}</CardTitle>
                    <CardDescription>{company}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    Applied {formatDate(app.created_at)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <StatusTracker currentStatus={app.status} />
              </CardContent>
              {showInterviewButton && (
                <CardFooter>
                  <Link href="/interview" className="w-full sm:w-auto">
                    <Button size="lg" className="w-full sm:w-auto">
                      Start Interview
                    </Button>
                  </Link>
                  {app.interview_deadline && (
                    <span className="ml-3 text-xs text-muted-foreground">
                      Deadline: {formatDate(app.interview_deadline)}
                    </span>
                  )}
                </CardFooter>
              )}
              {hasSession && sessionMessage && (
                <CardFooter>
                  <div className="w-full rounded-lg border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    {sessionMessage}
                  </div>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
