"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import InterviewReportView from "@/components/admin/interview-report";
import { backendFetch } from "@/lib/api/backend";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
interface CandidateDetailClientProps {
  application: any;
  resumeData: any | null;
  sessions: any[];
  qaItems: any[];
  reports: any[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CandidateDetailClient({
  application,
  resumeData,
  sessions,
  qaItems,
  reports,
}: CandidateDetailClientProps) {
  const [currentOverride, setCurrentOverride] = useState<{
    notes: string;
    override_recommendation: string;
  } | null>(
    application.recruiter_override
      ? {
          notes: application.recruiter_notes ?? "",
          override_recommendation: application.recruiter_override,
        }
      : null
  );
  const [recruiterNotes, setRecruiterNotes] = useState("");

  // Manual screening state
  const [manualScreenOpen, setManualScreenOpen] = useState(false);
  const [manualDecision, setManualDecision] = useState<"pass" | "reject">("pass");
  const [manualNotes, setManualNotes] = useState("");
  const [manualScreening, setManualScreening] = useState(false);
  const [manualScreenDone, setManualScreenDone] = useState<"pass" | "reject" | null>(null);

  const latestReport = reports[0] ?? null;
  const latestSession = sessions[0] ?? null;

  // Find QA items that belong to the latest session
  const latestSessionQa = latestSession
    ? qaItems.filter((qa) => qa.session_id === latestSession.id)
    : [];

  const audioUrl = latestSession?.recording_url ?? "";

  const hiringPost = application.hiring_posts;

  const handleOverride = useCallback(
    async (payload: { notes: string; override_recommendation: string }) => {
      try {
        await backendFetch(`/api/v1/reports/${latestReport.id}/override`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setCurrentOverride(payload);
      } catch {
        // Silently handle — real implementation would show a toast
      }
    },
    [latestReport]
  );

  const handleManualScreen = useCallback(async () => {
    setManualScreening(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      await backendFetch("/api/v1/screening/manual", {
        method: "POST",
        body: JSON.stringify({
          application_id: application.id,
          decision: manualDecision,
          notes: manualNotes || null,
        }),
        token: session?.access_token,
      });
      setManualScreenDone(manualDecision);
      setManualScreenOpen(false);
    } catch {
      // Silently handle — real implementation would show a toast
    } finally {
      setManualScreening(false);
    }
  }, [application.id, manualDecision, manualNotes]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">
          {application.candidate?.full_name || resumeData?.parsed_name || "Candidate"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {hiringPost?.title ?? "Unknown position"} &mdash;{" "}
          <Badge variant="secondary">{application.status}</Badge>
        </p>
      </div>

      {/* Manual screening banner and button */}
      {(application.status === "applied" || application.status === "screened") && !manualScreenDone && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Manual Screening Available
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Bypass automated scoring and manually pass or reject this candidate.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setManualScreenOpen(true)}
              className="flex-shrink-0"
            >
              Manual Screen
            </Button>
          </CardContent>
        </Card>
      )}

      {manualScreenDone && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              Manual screening complete: {manualScreenDone === "pass" ? "Passed" : "Rejected"}
            </p>
            <p className="text-xs text-green-700 dark:text-green-300">
              {manualScreenDone === "pass"
                ? "Interview invitation sent to candidate."
                : "Rejection email sent to candidate."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manual screening dialog */}
      <Dialog open={manualScreenOpen} onOpenChange={setManualScreenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Screen Candidate</DialogTitle>
            <DialogDescription>
              Bypass automated scoring and manually decide whether to pass or reject this candidate.
              This will trigger the same downstream actions (interview invite or rejection email).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Decision</label>
              <div className="flex gap-3">
                <Button
                  variant={manualDecision === "pass" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setManualDecision("pass")}
                  className="flex-1"
                >
                  Pass
                </Button>
                <Button
                  variant={manualDecision === "reject" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setManualDecision("reject")}
                  className="flex-1"
                >
                  Reject
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add any notes about this decision..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setManualScreenOpen(false)}
              disabled={manualScreening}
            >
              Cancel
            </Button>
            <Button
              onClick={handleManualScreen}
              disabled={manualScreening}
            >
              {manualScreening ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="interview">Interview</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* ---- Profile Tab ---- */}
        <TabsContent value="profile">
          <div className="space-y-4">
            {resumeData ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Contact</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {(application.candidate?.full_name || resumeData.parsed_name) && (
                      <p>Name: {application.candidate?.full_name || resumeData.parsed_name}</p>
                    )}
                    {(resumeData.parsed_email || resumeData.email || application.candidate?.email) && (
                      <p>Email: {resumeData.parsed_email || resumeData.email || application.candidate?.email}</p>
                    )}
                    {resumeData.parsed_name && 
                     application.candidate?.full_name && 
                     resumeData.parsed_name !== application.candidate.full_name && (
                      <p className="text-xs text-muted-foreground">
                        Name on resume: {resumeData.parsed_name}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {(resumeData.parsed_summary || resumeData.summary) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed">
                        {resumeData.parsed_summary || resumeData.summary}
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Skills</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {(resumeData.parsed_skills ?? resumeData.skills ?? []).map(
                        (skill: string, i: number) => (
                          <Badge key={i} variant="secondary">
                            {skill}
                          </Badge>
                        )
                      )}
                      {(resumeData.parsed_skills ?? resumeData.skills ?? []).length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No skills parsed
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {(resumeData.parsed_experience ?? resumeData.experience ?? []).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Experience</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(resumeData.parsed_experience ?? resumeData.experience ?? []).map((exp: any, i: number) => (
                        <div key={i} className="text-sm">
                          <p className="font-medium">
                            {exp.title ?? exp.role ?? "Role"}{" "}
                            {exp.company && (
                              <span className="text-muted-foreground">
                                at {exp.company}
                              </span>
                            )}
                          </p>
                          {exp.duration && (
                            <p className="text-xs text-muted-foreground">
                              {exp.duration}
                            </p>
                          )}
                          {exp.description && (
                            <p className="mt-0.5">{exp.description}</p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {(resumeData.parsed_education ?? resumeData.education ?? []).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Education</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(resumeData.parsed_education ?? resumeData.education ?? []).map((edu: any, i: number) => (
                        <div key={i} className="text-sm">
                          <p className="font-medium">
                            {edu.degree ?? edu.institution ?? "Education"}
                          </p>
                          {edu.institution && edu.degree && (
                            <p className="text-xs text-muted-foreground">
                              {edu.institution}
                            </p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No resume data available
                </CardContent>
              </Card>
            )}

            {/* Screening scores */}
            {application.overall_score != null && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Screening Scores</CardTitle>
                    <Link
                      href={`/candidates/${application.id}/score-details`}
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                      View Score Details →
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                    {[
                      ["Embedding", application.embedding_score],
                      ["Skill Match", application.skill_match_score],
                      ["Experience", application.experience_match_score],
                      ["Culture", application.culture_match_score],
                    ].map(([label, value]) => (
                      <div key={label as string} className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">{label as string}</p>
                        <p className="font-medium tabular-nums">
                          {value != null ? `${Math.round((value as number) * 100)}%` : "—"}
                        </p>
                      </div>
                    ))}
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Overall</p>
                      <p className="font-bold tabular-nums">
                        {Math.round(application.overall_score * 100)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ---- Interview Tab ---- */}
        <TabsContent value="interview">
          {latestReport || qaItems.length > 0 ? (
            <InterviewReportView
              report={latestReport}
              reports={reports}
              sessions={sessions}
              qaItems={qaItems}
              audioUrl={audioUrl}
              onOverride={handleOverride}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No interview data available
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---- Notes Tab ---- */}
        <TabsContent value="notes">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recruiter Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Add notes about this candidate..."
                  value={recruiterNotes}
                  onChange={(e) => setRecruiterNotes(e.target.value)}
                  rows={6}
                />
              </CardContent>
            </Card>

            {currentOverride && (
              <Card>
                <CardHeader>
                  <CardTitle>Recruiter Override</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      Decision: {currentOverride.override_recommendation}
                    </p>
                    {currentOverride.notes && (
                      <p className="mt-1 text-muted-foreground">
                        {currentOverride.notes}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
