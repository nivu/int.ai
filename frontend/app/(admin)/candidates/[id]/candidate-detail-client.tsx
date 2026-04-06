"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import InterviewReportView from "@/components/admin/interview-report";
import { backendFetch } from "@/lib/api/backend";

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
  const [overrideHistory, setOverrideHistory] = useState<
    { notes: string; override_recommendation: string; at: string }[]
  >([]);
  const [recruiterNotes, setRecruiterNotes] = useState("");

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
        await backendFetch(`/api/reports/${latestReport.id}/override`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setOverrideHistory((prev) => [
          ...prev,
          { ...payload, at: new Date().toISOString() },
        ]);
      } catch {
        // Silently handle — real implementation would show a toast
      }
    },
    [latestReport]
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">
          {resumeData?.parsed_name || application.candidate?.full_name || "Candidate"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {hiringPost?.title ?? "Unknown position"} &mdash;{" "}
          <Badge variant="secondary">{application.status}</Badge>
        </p>
      </div>

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
                    {(resumeData.parsed_email || resumeData.email) && <p>Email: {resumeData.parsed_email || resumeData.email}</p>}
                    {(resumeData.parsed_name || resumeData.name) && <p>Name: {resumeData.parsed_name || resumeData.name}</p>}
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
                  <CardTitle>Screening Scores</CardTitle>
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
          {latestReport ? (
            <InterviewReportView
              report={latestReport}
              qaItems={latestSessionQa}
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

            {overrideHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Override History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overrideHistory.map((entry, i) => (
                    <div
                      key={i}
                      className="rounded-md border p-3 text-sm"
                    >
                      <p className="font-medium">
                        Override: {entry.override_recommendation}
                      </p>
                      {entry.notes && (
                        <p className="mt-1 text-muted-foreground">
                          {entry.notes}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(entry.at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
