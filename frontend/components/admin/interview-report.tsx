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
import { ChevronDown, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterviewReport {
  id: string;
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
  question_text: string;
  answer_text: string;
  technical_accuracy: number;
  depth_of_understanding: number;
  communication_clarity: number;
  relevance_to_jd: number;
  score_rationale?: string;
}

interface OverridePayload {
  notes: string;
  override_recommendation: string;
}

interface InterviewReportProps {
  report: InterviewReport;
  qaItems: QAItem[];
  audioUrl: string;
  onOverride?: (payload: OverridePayload) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeColor(grade: number): string {
  if (grade >= 70) return "text-emerald-600";
  if (grade >= 60) return "text-amber-500";
  return "text-red-500";
}

function gradeBg(grade: number): string {
  if (grade >= 70) return "bg-emerald-50 ring-emerald-200";
  if (grade >= 60) return "bg-amber-50 ring-amber-200";
  return "bg-red-50 ring-red-200";
}

function recommendationVariant(
  rec: string
): "default" | "secondary" | "destructive" {
  if (rec === "advance") return "default";
  if (rec === "borderline") return "secondary";
  return "destructive";
}

function recommendationLabel(rec: string): string {
  return rec.charAt(0).toUpperCase() + rec.slice(1);
}

// ---------------------------------------------------------------------------
// ScoreBar sub-component
// ---------------------------------------------------------------------------

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 10) * 100);
  let barColor = "bg-emerald-500";
  if (value < 5) barColor = "bg-red-400";
  else if (value < 7) barColor = "bg-amber-400";

  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-xs font-medium tabular-nums">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QA Accordion item
// ---------------------------------------------------------------------------

function QAAccordionItem({ qa, index }: { qa: QAItem; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 whitespace-normal break-words">
          Q{index + 1}: {qa.question_text}
        </span>
      </button>
      {open && (
        <div className="space-y-4 px-4 pb-4 pt-1">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Answer
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {qa.answer_text || "No answer recorded"}
            </p>
          </div>
          <div className="space-y-2">
            <ScoreBar
              label="Technical Accuracy"
              value={qa.technical_accuracy}
            />
            <ScoreBar
              label="Depth of Understanding"
              value={qa.depth_of_understanding}
            />
            <ScoreBar
              label="Communication Clarity"
              value={qa.communication_clarity}
            />
            <ScoreBar label="Relevance to JD" value={qa.relevance_to_jd} />
          </div>
          {qa.score_rationale && (
            <p className="text-xs italic text-muted-foreground">
              {qa.score_rationale}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InterviewReportView({
  report,
  qaItems,
  audioUrl,
  onOverride,
}: InterviewReportProps) {
  const [notes, setNotes] = useState("");
  const [overrideRec, setOverrideRec] = useState("no_override");

  const handleSave = () => {
    onOverride?.({
      notes,
      override_recommendation: overrideRec,
    });
  };

  // Prepare radar data from dimension averages
  const radarData = report.dimension_averages
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

  return (
    <div className="space-y-6">
      {/* Header: Overall Grade + Recommendation */}
      <div className="flex flex-wrap items-center gap-6">
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-2xl ring-1 ${gradeBg(report.overall_grade)}`}
        >
          <span
            className={`text-3xl font-bold tabular-nums ${gradeColor(report.overall_grade)}`}
          >
            {Math.round(report.overall_grade)}
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Overall Grade</p>
          <Badge variant={recommendationVariant(report.recommendation)}>
            {recommendationLabel(report.recommendation)}
          </Badge>
        </div>
      </div>

      {/* AI Summary */}
      <Card>
        <CardHeader>
          <CardTitle>AI Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{report.summary}</p>
          {report.strengths.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold text-emerald-600">
                Strengths
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-sm">
                {report.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {report.concerns.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-amber-600">
                Concerns
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-sm">
                {report.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Radar */}
      {radarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dimension Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRadar data={radarData} />
          </CardContent>
        </Card>
      )}

      {/* Per-question Accordion */}
      <Card>
        <CardHeader>
          <CardTitle>Questions &amp; Answers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {qaItems.map((qa, i) => (
              <QAAccordionItem key={qa.id} qa={qa} index={i} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audio Player */}
      {audioUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Interview Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <AudioPlayer src={audioUrl} />
          </CardContent>
        </Card>
      )}

      {/* Recruiter Override Section */}
      <Card>
        <CardHeader>
          <CardTitle>Recruiter Notes &amp; Override</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Add recruiter notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
          <div className="flex items-center gap-4">
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
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
