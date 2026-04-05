"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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

interface Application {
  id: string;
  status: ApplicationStatus;
  created_at: string;
  interview_deadline: string | null;
  hiring_post: {
    id: string;
    title: string;
    company_name: string | null;
  } | null;
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
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidateId, setCandidateId] = useState<string | null>(null);

  const supabase = createClient();

  const fetchApplications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Get candidate record
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!candidate) {
      setLoading(false);
      return;
    }

    setCandidateId(candidate.id);

    // Fetch applications with hiring post info
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
          company_name
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Applications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track the progress of your applications in real time.
        </p>
      </div>

      <div className="space-y-4">
        {applications.map((app) => {
          const jobTitle = app.hiring_post?.title ?? "Untitled Position";
          const company = app.hiring_post?.company_name ?? "Unknown Company";
          const showInterviewButton =
            app.status === "interview_invited" &&
            isWithinDeadline(app.interview_deadline);

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
            </Card>
          );
        })}
      </div>
    </div>
  );
}
