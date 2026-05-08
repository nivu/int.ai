"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Info, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillMatchDetails {
  skills: {
    skill: string;
    matched: boolean;
    confidence: number;
    evidence: string;
  }[];
}

export interface ExperienceMatchDetails {
  seniority_alignment: { score: number; reasoning: string };
  years_of_experience: { score: number; reasoning: string };
  project_complexity: { score: number; reasoning: string };
  domain_relevance: { score: number; reasoning: string };
}

export interface CultureMatchDetails {
  collaboration_signals: { score: number; reasoning: string };
  communication_style: { score: number; reasoning: string };
  initiative_indicators: { score: number; reasoning: string };
}

// ---------------------------------------------------------------------------
// Shared internals
// ---------------------------------------------------------------------------

function ScorePopoverShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus:outline-none"
        aria-label={`${title} breakdown`}
      >
        <Info className="size-3" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={6}>
          <PopoverPrimitive.Popup
            className={cn(
              "z-50 w-72 rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10",
              "duration-100 outline-none",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <p className="text-xs font-semibold mb-2.5 text-foreground">
              {title}
            </p>
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function MiniBar({ score }: { score: number }) {
  const colorClass =
    score >= 0.7
      ? "bg-green-500"
      : score >= 0.5
        ? "bg-yellow-500"
        : "bg-red-400";
  return (
    <div className="h-1.5 w-14 rounded-full bg-border flex-shrink-0">
      <div
        className={cn("h-full rounded-full", colorClass)}
        style={{ width: `${Math.round(score * 100)}%` }}
      />
    </div>
  );
}

function DimensionRow({
  label,
  score,
  reasoning,
}: {
  label: string;
  score: number;
  reasoning: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground w-20 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
        <MiniBar score={score} />
        <span className="text-xs tabular-nums text-muted-foreground w-7 text-right">
          {Math.round(score * 100)}%
        </span>
      </div>
      <span className="text-xs text-muted-foreground line-clamp-2 min-w-0">
        {reasoning}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported components
// ---------------------------------------------------------------------------

export function SkillMatchPopover({ details }: { details: SkillMatchDetails }) {
  const { skills } = details;
  const matched = skills.filter((s) => s.matched);
  const unmatched = skills.filter((s) => !s.matched);

  return (
    <ScorePopoverShell title="Skill Match">
      <div className="space-y-1">
        {matched.map((s) => (
          <div key={s.skill} className="flex items-start gap-1.5">
            <CheckCircle2 className="size-3 text-green-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-xs font-medium text-foreground">
                {s.skill}
              </span>
              {s.evidence && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {s.evidence}
                </p>
              )}
            </div>
          </div>
        ))}
        {unmatched.map((s) => (
          <div key={s.skill} className="flex items-start gap-1.5">
            <XCircle className="size-3 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-xs font-medium text-muted-foreground">
                {s.skill}
              </span>
              {s.evidence && (
                <p className="text-xs text-muted-foreground/70 line-clamp-1">
                  {s.evidence}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScorePopoverShell>
  );
}

export function ExperienceMatchPopover({
  details,
}: {
  details: ExperienceMatchDetails;
}) {
  return (
    <ScorePopoverShell title="Experience Match">
      <DimensionRow
        label="Seniority"
        score={details.seniority_alignment.score}
        reasoning={details.seniority_alignment.reasoning}
      />
      <DimensionRow
        label="Years Exp."
        score={details.years_of_experience.score}
        reasoning={details.years_of_experience.reasoning}
      />
      <DimensionRow
        label="Complexity"
        score={details.project_complexity.score}
        reasoning={details.project_complexity.reasoning}
      />
      <DimensionRow
        label="Domain"
        score={details.domain_relevance.score}
        reasoning={details.domain_relevance.reasoning}
      />
    </ScorePopoverShell>
  );
}

export function CultureMatchPopover({
  details,
}: {
  details: CultureMatchDetails;
}) {
  return (
    <ScorePopoverShell title="Culture Match">
      <DimensionRow
        label="Collaboration"
        score={details.collaboration_signals.score}
        reasoning={details.collaboration_signals.reasoning}
      />
      <DimensionRow
        label="Communication"
        score={details.communication_style.score}
        reasoning={details.communication_style.reasoning}
      />
      <DimensionRow
        label="Initiative"
        score={details.initiative_indicators.score}
        reasoning={details.initiative_indicators.reasoning}
      />
    </ScorePopoverShell>
  );
}
