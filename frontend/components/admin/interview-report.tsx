"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import AudioPlayer from "@/components/shared/audio-player";
import ScoreRadar from "@/components/shared/score-radar";
import { Clock, MessageSquare, Calendar, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterviewReport {
  id: string;
  session_id?: string;
  overall_grade: number;
  recommendation: "advance" | "borderline" | "reject";
  summary: string;
  strengths: string[];
  concerns: string[];
  dimension_averages?: {
    technical_accuracy: number;
    depth_of_understanding: number;
    communication_clarity: number;
    relevance_to_jd: number;
  };
}

interface QAItem {
  id: string;
  session_id: string;
  question_number?: number;
  question_text: string;
  answer_text: string;
  technical_accuracy: number;
  depth_of_understanding: number;
  communication_clarity: number;
  relevance_to_jd: number;
  score_rationale?: string;
  per_dimension_reasoning?: {
    technical_accuracy?: string;
    depth_of_understanding?: string;
    communication_clarity?: string;
    relevance_to_jd?: string;
  };
}

interface InterviewSession {
  id: string;
  status?: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  questions_asked?: number;
  recording_url?: string;
  terminated_at_question?: number;
  timer_remaining_at_termination?: number;
}

interface OverridePayload {
  notes: string;
  override_recommendation: string;
}

interface InterviewReportProps {
  report: InterviewReport | null;
  reports?: InterviewReport[];
  sessions: InterviewSession[];
  qaItems: QAItem[];
  audioUrl: string;
  onOverride?: (payload: OverridePayload) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Per-spec bands: 80+ advance, 55-79 borderline, <55 reject
function gradeColor(grade: number): string {
  if (grade >= 80) return "text-emerald-600";
  if (grade >= 55) return "text-amber-500";
  return "text-red-500";
}

function gradeBg(grade: number): string {
  if (grade >= 80) return "bg-emerald-50 ring-1 ring-emerald-200";
  if (grade >= 55) return "bg-amber-50 ring-1 ring-amber-200";
  return "bg-red-50 ring-1 ring-red-200";
}

function recommendationVariant(
  rec: string
): "default" | "secondary" | "destructive" {
  if (rec === "advance") return "default";
  if (rec === "borderline") return "secondary";
  return "destructive";
}

function recommendationLabel(rec: string): string {
  if (rec === "advance") return "Advance";
  if (rec === "borderline") return "Borderline";
  if (rec === "reject") return "Reject";
  return rec.charAt(0).toUpperCase() + rec.slice(1);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sessionStatusBadge(status?: string) {
  if (!status) return null;
  if (status === "terminated_tab_switch") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300 uppercase tracking-wide">
        <AlertTriangle className="size-2.5" />
        Tab Switch Terminated
      </span>
    );
  }
  if (status === "terminated_abandoned") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300 uppercase tracking-wide">
        <AlertTriangle className="size-2.5" />
        Abandoned
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 uppercase tracking-wide">
        Completed
      </span>
    );
  }
  return null;
}

function scoreBadgeColor(score: number): string {
  if (score >= 7) return "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40";
  if (score >= 4) return "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40";
  return "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40";
}

// ---------------------------------------------------------------------------
// Session block — transcript + per-question scores for one attempt
// ---------------------------------------------------------------------------

function SessionBlock({
  session,
  qaItems,
  attemptNumber,
  totalAttempts,
}: {
  session: InterviewSession;
  report?: InterviewReport | null;
  qaItems: QAItem[];
  attemptNumber: number;
  totalAttempts: number;
}) {
  const sortedQa = [...qaItems].sort(
    (a, b) => (a.question_number ?? 0) - (b.question_number ?? 0)
  );
  const isLatest = attemptNumber === totalAttempts;
  const isTerminated =
    session.status === "terminated_tab_switch" ||
    session.status === "terminated_abandoned";

  const dimLabels: Record<string, string> = {
    technical_accuracy: "Technical",
    depth_of_understanding: "Depth",
    communication_clarity: "Clarity",
    relevance_to_jd: "Relevance",
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Session {attemptNumber}
          </span>
          {isLatest && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary uppercase tracking-wide">
              Latest
            </span>
          )}
          {sessionStatusBadge(session.status)}
        </div>
        {session.started_at && (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(session.started_at)}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {session.duration_seconds != null && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />{formatDuration(session.duration_seconds)}
            </span>
          )}
          {sortedQa.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="size-3" />{sortedQa.length} questions
            </span>
          )}
        </div>
      </div>

      {/* ── Termination detail banner ───────────────────────────────── */}
      {isTerminated && (
        <div className="border-b bg-red-50 dark:bg-red-950/20 px-5 py-2.5 text-xs text-red-700 dark:text-red-300 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <span className="font-semibold">Terminated at:</span>{" "}
            Question {session.terminated_at_question ?? "unknown"}
          </span>
          {session.timer_remaining_at_termination != null && (
            <span>
              <span className="font-semibold">Timer remaining:</span>{" "}
              {Math.round(session.timer_remaining_at_termination)}s
            </span>
          )}
          <span className="italic">
            {session.status === "terminated_tab_switch"
              ? "Candidate switched browser tabs during the interview."
              : "Candidate navigated away or refreshed during the interview."}
          </span>
        </div>
      )}

      {/* ── Q&A with per-question scores ───────────────────────────── */}
      <div className="px-5 py-5">
        {sortedQa.length > 0 ? (
          <div className="space-y-6">
            {sortedQa.map((qa, i) => {
              const isSkipped = !qa.answer_text?.trim();
              const hasDimScores =
                qa.technical_accuracy != null ||
                qa.depth_of_understanding != null;

              return (
                <div key={qa.id} className="space-y-3">
                  {/* Interviewer turn */}
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                      Q{qa.question_number ?? i + 1}
                    </span>
                    <p className="text-sm text-foreground leading-relaxed">
                      {qa.question_text}
                    </p>
                  </div>

                  {/* Candidate turn */}
                  <div className="flex items-start gap-3 pl-2">
                    <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Candidate
                    </span>
                    {isSkipped ? (
                      <p className="text-sm italic text-muted-foreground">
                        No response — timer expired
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {qa.answer_text}
                      </p>
                    )}
                  </div>

                  {/* Dimension scores — shown for all questions (0 for skipped) */}
                  {hasDimScores && (
                    <div className="pl-2 flex flex-wrap gap-2">
                      {(
                        [
                          "technical_accuracy",
                          "depth_of_understanding",
                          "communication_clarity",
                          "relevance_to_jd",
                        ] as const
                      ).map((dim) => {
                        const score = qa[dim] ?? 0;
                        const reasoning = qa.per_dimension_reasoning?.[dim];
                        return (
                          <div
                            key={dim}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${scoreBadgeColor(score)}`}
                            title={reasoning ?? ""}
                          >
                            <span className="opacity-70">{dimLabels[dim]}:</span>
                            <span className="font-bold tabular-nums">{score}/10</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {i < sortedQa.length - 1 && (
                    <div className="pt-1 border-b border-dashed border-border/50" />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No transcript available for this session.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InterviewReportView({
  report,
  sessions,
  qaItems,
  audioUrl,
  reports = [],
  onOverride,
}: InterviewReportProps) {
  const [notes, setNotes] = useState("");
  const [overrideRec, setOverrideRec] = useState("no_override");

  const latestSession = sessions[0] ?? null;

  const handleSave = () => {
    onOverride?.({ notes, override_recommendation: overrideRec });
  };

  const radarData = report?.dimension_averages
    ? [
        {
          name: "Candidate",
          technical: report.dimension_averages.technical_accuracy,
          depth: report.dimension_averages.depth_of_understanding,
          communication: report.dimension_averages.communication_clarity,
          relevance: report.dimension_averages.relevance_to_jd,
        },
      ]
    : [];

  const reportBySession = new Map<string, InterviewReport>();
  for (const r of (reports ?? [report].filter(Boolean))) {
    if (r?.session_id) reportBySession.set(r.session_id, r);
  }
  if (report && !reportBySession.size && latestSession) {
    reportBySession.set(latestSession.id, report);
  }

  const qaBySession = new Map<string, QAItem[]>();
  for (const s of sessions) qaBySession.set(s.id, []);
  for (const qa of qaItems) {
    if (!qaBySession.has(qa.session_id)) qaBySession.set(qa.session_id, []);
    qaBySession.get(qa.session_id)!.push(qa);
  }
  for (const items of qaBySession.values()) {
    items.sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0));
  }

  // Show sessions that have QA items OR were terminated (so recruiter can see them)
  const populatedSessions = sessions.filter(
    (s) =>
      (qaBySession.get(s.id)?.length ?? 0) > 0 ||
      s.status === "terminated_tab_switch" ||
      s.status === "terminated_abandoned"
  );

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-4">
        {report && (
          <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl ${gradeBg(report.overall_grade)}`}>
            <span className={`text-3xl font-bold tabular-nums ${gradeColor(report.overall_grade)}`}>
              {Math.round(report.overall_grade)}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">/ 100</span>
          </div>
        )}
        <div className="flex flex-col justify-center gap-2">
          {report && (
            <Badge variant={recommendationVariant(report.recommendation)} className="w-fit">
              {recommendationLabel(report.recommendation)}
            </Badge>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {latestSession?.started_at && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" />
                Latest: {formatDateTime(latestSession.started_at)}
              </span>
            )}
            {sessions.length > 1 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3" />
                {sessions.length} attempts
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Summary ─────────────────────────────────────────────── */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{report.summary}</p>
            {(report.strengths.length > 0 || report.concerns.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {report.strengths.length > 0 && (
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3">
                    <p className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                      Strengths
                    </p>
                    <ul className="space-y-1">
                      {report.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-sm text-emerald-900 dark:text-emerald-200">
                          <span className="mt-0.5 text-emerald-500">✓</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.concerns.length > 0 && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">
                    <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                      Concerns
                    </p>
                    <ul className="space-y-1">
                      {report.concerns.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-sm text-amber-900 dark:text-amber-200">
                          <span className="mt-0.5 text-amber-500">⚠</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Interview Attempts ─────────────────────────────────────── */}
      {populatedSessions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Interview Attempts
            </h3>
            {populatedSessions.length > 1 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {populatedSessions.length} sessions
              </span>
            )}
          </div>
          <div className="space-y-4">
            {populatedSessions.map((session, idx) => (
              <SessionBlock
                key={session.id}
                session={session}
                report={reportBySession.get(session.id) ?? null}
                qaItems={qaBySession.get(session.id) ?? []}
                attemptNumber={populatedSessions.length - idx}
                totalAttempts={populatedSessions.length}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Dimension Overview ─────────────────────────────────────── */}
      {radarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dimension Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRadar data={radarData} />
          </CardContent>
        </Card>
      )}

      {/* ── Recording ──────────────────────────────────────────────── */}
      {audioUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interview Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <AudioPlayer src={audioUrl} />
          </CardContent>
        </Card>
      )}

      {/* ── Recruiter Override ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recruiter Override</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Add notes about this interview..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium" htmlFor="override-select">
              Override Recommendation
            </label>
            <select
              id="override-select"
              value={overrideRec}
              onChange={(e) => setOverrideRec(e.target.value)}
              className="rounded-md border bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="no_override">No Override</option>
              <option value="advance">Advance</option>
              <option value="borderline">Borderline</option>
              <option value="reject">Reject</option>
            </select>
          </div>
          <Button onClick={handleSave} size="sm">
            Save Override
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
