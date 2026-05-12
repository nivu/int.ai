"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { backendFetch } from "@/lib/api/backend";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillEntry {
  skill: string;
  matched: boolean;
  confidence: number;
  evidence: string;
}

interface DimensionEntry {
  score: number;
  reasoning: string;
  evidence?: string; // verbatim resume quote — present after backend update
}

interface ActiveItem {
  label: string;
  evidence: string; // verbatim quote to locate and highlight in resume
}

interface ScoreDetailsClientProps {
  applicationId: string;
  application: {
    embedding_score: number | null;
    skill_match_score: number | null;
    experience_match_score: number | null;
    culture_match_score: number | null;
    overall_score: number | null;
  };
  resumeData: {
    raw_markdown: string | null;
    parsed_name: string | null;
    parsed_skills: string[] | null;
    skill_match_details: { skills: SkillEntry[] } | null;
    experience_match_details: {
      seniority_alignment: DimensionEntry;
      years_of_experience: DimensionEntry;
      project_complexity: DimensionEntry;
      domain_relevance: DimensionEntry;
    } | null;
    culture_match_details: {
      collaboration_signals: DimensionEntry;
      communication_style: DimensionEntry;
      initiative_indicators: DimensionEntry;
    } | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function scoreColor(v: number) {
  if (v >= 0.7) return "bg-green-500";
  if (v >= 0.5) return "bg-yellow-500";
  return "bg-red-400";
}

function scoreTextColor(v: number | null | undefined) {
  if (v == null) return "text-muted-foreground";
  if (v >= 0.7) return "text-green-600 dark:text-green-400";
  if (v >= 0.5) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

// Find the evidence string in the resume (case-insensitive) and return
// the surrounding line block for cleaner context. Returns null if not found.
function findPassage(
  resume: string,
  evidence: string
): { start: number; end: number } | null {
  if (!evidence || evidence.length < 4) return null;
  const idx = resume.toLowerCase().indexOf(evidence.toLowerCase());
  if (idx === -1) return null;
  // Expand to nearest line boundaries
  const lineStart = resume.lastIndexOf("\n", idx);
  const lineEnd = resume.indexOf("\n", idx + evidence.length);
  return {
    start: lineStart === -1 ? 0 : lineStart + 1,
    end: lineEnd === -1 ? resume.length : lineEnd,
  };
}

// Render resume text with the exact evidence phrase highlighted within its passage
function highlightPassage(
  text: string,
  evidence: string,
  passage: { start: number; end: number } | null
): React.ReactNode[] {
  if (!passage) return [text];

  const before = text.slice(0, passage.start);
  const block = text.slice(passage.start, passage.end);
  const after = text.slice(passage.end);

  // Within the block, highlight the exact evidence phrase
  const evidenceLower = evidence.toLowerCase();
  const blockLower = block.toLowerCase();
  const matchIdx = blockLower.indexOf(evidenceLower);

  let highlightedBlock: React.ReactNode;
  if (matchIdx !== -1) {
    highlightedBlock = (
      <>
        {block.slice(0, matchIdx)}
        <mark className="bg-yellow-200 dark:bg-yellow-800/60 text-foreground rounded-sm">
          {block.slice(matchIdx, matchIdx + evidence.length)}
        </mark>
        {block.slice(matchIdx + evidence.length)}
      </>
    );
  } else {
    highlightedBlock = (
      <mark className="bg-yellow-200 dark:bg-yellow-800/60 text-foreground rounded-sm">
        {block}
      </mark>
    );
  }

  return [
    <span key="before">{before}</span>,
    <span key="block">{highlightedBlock}</span>,
    <span key="after">{after}</span>,
  ];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-border">
      <div
        className={cn("h-full rounded-full transition-all", scoreColor(score))}
        style={{ width: `${Math.round(score * 100)}%` }}
      />
    </div>
  );
}

function SkillRow({
  entry,
  isActive,
  onMouseEnter,
  onMouseLeave,
}: {
  entry: SkillEntry;
  isActive: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 cursor-default transition-colors",
        isActive
          ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
          : "hover:bg-muted/40"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {entry.matched ? (
        <CheckCircle2 className="size-4 text-green-500 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="size-4 text-red-400 flex-shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{entry.skill}</span>
          <Badge
            variant="secondary"
            className={cn(
              "text-xs flex-shrink-0",
              entry.matched
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
            )}
          >
            {Math.round(entry.confidence * 100)}%
          </Badge>
        </div>
        {entry.evidence && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {entry.evidence}
          </p>
        )}
      </div>
    </div>
  );
}

function DimensionRow({
  label,
  entry,
  isActive,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string;
  entry: DimensionEntry;
  isActive: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors cursor-default",
        isActive ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className={cn("text-sm font-bold tabular-nums", scoreTextColor(entry.score))}>
          {pct(entry.score)}
        </span>
      </div>
      <ScoreBar score={entry.score} />
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        {entry.reasoning}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScoreDetailsClient({
  applicationId,
  application,
  resumeData,
}: ScoreDetailsClientProps) {
  const [active, setActive] = useState<ActiveItem | null>(null);
  const [rescreening, setRescreening] = useState(false);
  const [rescreenDone, setRescreenDone] = useState(false);
  const resumeScrollRef = useRef<HTMLDivElement>(null);

  // Detect whether evidence fields are present (requires re-screen if not)
  const expDetails = resumeData?.experience_match_details ?? null;
  const cultureDetails = resumeData?.culture_match_details ?? null;
  const needsRescreen =
    (expDetails && !expDetails.seniority_alignment?.evidence) ||
    (cultureDetails && !cultureDetails.collaboration_signals?.evidence);

  async function handleRescreen() {
    setRescreening(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      await backendFetch("/api/v1/screening/trigger", {
        method: "POST",
        body: JSON.stringify({ application_id: applicationId }),
        token: session?.access_token,
      });
      setRescreenDone(true);
    } catch {
      // ignore
    } finally {
      setRescreening(false);
    }
  }

  // Scroll to highlighted passage whenever active changes
  useEffect(() => {
    const container = resumeScrollRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      const mark = container.querySelector("mark");
      if (!mark) return;
      const containerRect = container.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();
      const scrollTarget =
        markRect.top - containerRect.top + container.scrollTop - container.clientHeight / 2;
      container.scrollTo({ top: scrollTarget, behavior: "smooth" });
    }, 30);
    return () => clearTimeout(timer);
  }, [active]);

  const skillDetails = resumeData?.skill_match_details ?? null;
  const rawText = resumeData?.raw_markdown ?? null;

  return (
    <div className="space-y-5">
    {needsRescreen && !rescreenDone && (
      <div className="flex items-center justify-between rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm">
        <p className="text-yellow-800 dark:text-yellow-200">
          This candidate was screened before resume highlighting was available. Re-screen to enable hover-to-highlight for Experience and Culture.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="ml-4 flex-shrink-0"
          disabled={rescreening}
          onClick={handleRescreen}
        >
          <RefreshCw className={cn("mr-1.5 size-3", rescreening && "animate-spin")} />
          {rescreening ? "Re-screening…" : "Re-screen"}
        </Button>
      </div>
    )}
    {rescreenDone && (
      <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
        Re-screening started — refresh this page in a minute to see updated highlights.
      </div>
    )}
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

      {/* ------------------------------------------------------------------ */}
      {/* LEFT — Score breakdowns                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-5">

        {/* Overall summary */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-5 gap-2 text-center">
              {[
                ["Embedding", application.embedding_score],
                ["Skill", application.skill_match_score],
                ["Experience", application.experience_match_score],
                ["Culture", application.culture_match_score],
                ["Overall", application.overall_score],
              ].map(([label, value]) => (
                <div key={label as string} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{label as string}</p>
                  <p className={cn("font-bold tabular-nums text-sm", scoreTextColor(value as number | null))}>
                    {pct(value as number | null)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Skill Match */}
        {skillDetails ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Skill Match</CardTitle>
                <span className={cn("font-bold tabular-nums", scoreTextColor(application.skill_match_score))}>
                  {pct(application.skill_match_score)}
                </span>
              </div>
              <ScoreBar score={application.skill_match_score ?? 0} />
            </CardHeader>
            <CardContent className="space-y-2">
              {skillDetails.skills.map((s) => (
                <SkillRow
                  key={s.skill}
                  entry={s}
                  isActive={active?.label === s.skill}
                  onMouseEnter={() =>
                    setActive({ label: s.skill, evidence: s.evidence })
                  }
                  onMouseLeave={() => setActive(null)}
                />
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Skill Match</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              No breakdown available — candidate may not have been screened yet.
            </CardContent>
          </Card>
        )}

        {/* Experience Match */}
        {expDetails ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Experience Match</CardTitle>
                <span className={cn("font-bold tabular-nums", scoreTextColor(application.experience_match_score))}>
                  {pct(application.experience_match_score)}
                </span>
              </div>
              <ScoreBar score={application.experience_match_score ?? 0} />
            </CardHeader>
            <CardContent className="space-y-2">
              {(
                [
                  ["Seniority Alignment", expDetails.seniority_alignment],
                  ["Years of Experience", expDetails.years_of_experience],
                  ["Project Complexity", expDetails.project_complexity],
                  ["Domain Relevance", expDetails.domain_relevance],
                ] as [string, DimensionEntry][]
              ).map(([label, entry]) => (
                <DimensionRow
                  key={label}
                  label={label}
                  entry={entry}
                  isActive={active?.label === label}
                  onMouseEnter={() =>
                    setActive({ label, evidence: entry.evidence ?? "" })
                  }
                  onMouseLeave={() => setActive(null)}
                />
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Experience Match</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">No breakdown available.</CardContent>
          </Card>
        )}

        {/* Culture Match */}
        {cultureDetails ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Culture Match</CardTitle>
                <span className={cn("font-bold tabular-nums", scoreTextColor(application.culture_match_score))}>
                  {pct(application.culture_match_score)}
                </span>
              </div>
              <ScoreBar score={application.culture_match_score ?? 0} />
            </CardHeader>
            <CardContent className="space-y-2">
              {(
                [
                  ["Collaboration Signals", cultureDetails.collaboration_signals],
                  ["Communication Style", cultureDetails.communication_style],
                  ["Initiative Indicators", cultureDetails.initiative_indicators],
                ] as [string, DimensionEntry][]
              ).map(([label, entry]) => (
                <DimensionRow
                  key={label}
                  label={label}
                  entry={entry}
                  isActive={active?.label === label}
                  onMouseEnter={() =>
                    setActive({ label, evidence: entry.evidence ?? "" })
                  }
                  onMouseLeave={() => setActive(null)}
                />
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Culture Match</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">No breakdown available.</CardContent>
          </Card>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RIGHT — Resume panel                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resume</CardTitle>
            <p className="text-xs text-muted-foreground">
              Hover any skill, dimension, or culture signal to jump to the relevant section of the resume.
            </p>
          </CardHeader>
          <CardContent>
            {rawText ? (
              <div
                ref={resumeScrollRef}
                className="max-h-[70vh] overflow-y-auto rounded-md bg-muted/30 p-4"
              >
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
                  {active
                    ? highlightPassage(rawText, active.evidence, findPassage(rawText, active.evidence))
                    : rawText}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Resume text not available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
