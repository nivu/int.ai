import { createClient } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ScoreRadar from "@/components/shared/score-radar";

// ---------------------------------------------------------------------------
// Helpers (duplicated from interview-report to avoid pulling in "use client")
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
// Page
// ---------------------------------------------------------------------------

function getPublicSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getPublicSupabase();

  // Fetch the report by share_token (RLS policy allows public access via token)
  const { data: report, error } = await supabase
    .from("interview_reports")
    .select(
      `
      id,
      overall_grade,
      recommendation,
      summary,
      strengths,
      concerns,
      dimension_averages,
      share_expires_at,
      interview_sessions (
        id,
        candidate:candidates (
          id,
          name,
          email
        )
      )
    `
    )
    .eq("share_token", token)
    .single();

  if (error || !report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold">Report not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This report link is invalid or has been removed.
        </p>
      </div>
    );
  }

  // Check expiration
  if (
    report.share_expires_at &&
    new Date(report.share_expires_at) < new Date()
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold">Link expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This report link has expired. Please request a new link from the
          recruiter.
        </p>
      </div>
    );
  }

  // Fetch QA items for this report
  const { data: qaItems } = await supabase
    .from("interview_qa_items")
    .select(
      "id, question_text, answer_transcript, technical_accuracy, depth_of_understanding, communication_clarity, relevance_to_jd, score_rationale"
    )
    .eq("report_id", report.id)
    .order("created_at", { ascending: true });

  const session = (report as Record<string, unknown>).interview_sessions as
    | { candidate: { name: string; email: string } | null }
    | null;
  const candidate = session?.candidate;

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
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Candidate info */}
      {candidate && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold">{candidate.name}</h2>
          <p className="text-sm text-muted-foreground">{candidate.email}</p>
        </div>
      )}

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
              {report.recommendation.charAt(0).toUpperCase() +
                report.recommendation.slice(1)}
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
            {report.strengths?.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold text-emerald-600">
                  Strengths
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-sm">
                  {report.strengths.map((s: string, i: number) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.concerns?.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold text-amber-600">
                  Concerns
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-sm">
                  {report.concerns.map((c: string, i: number) => (
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

        {/* Per-question details */}
        {qaItems && qaItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Questions &amp; Answers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {qaItems.map(
                (
                  qa: {
                    id: string;
                    question_text: string;
                    answer_transcript: string;
                    technical_accuracy: number;
                    depth_of_understanding: number;
                    communication_clarity: number;
                    relevance_to_jd: number;
                    score_rationale?: string;
                  },
                  i: number
                ) => (
                  <div key={qa.id} className="space-y-3 border-b pb-4 last:border-b-0">
                    <p className="text-sm font-medium">
                      Q{i + 1}: {qa.question_text}
                    </p>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Answer Transcript
                      </p>
                      <p className="text-sm leading-relaxed">
                        {qa.answer_transcript}
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
                      <ScoreBar
                        label="Relevance to JD"
                        value={qa.relevance_to_jd}
                      />
                    </div>
                    {qa.score_rationale && (
                      <p className="text-xs italic text-muted-foreground">
                        {qa.score_rationale}
                      </p>
                    )}
                  </div>
                )
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Powered by int.ai
      </p>
    </div>
  );
}
