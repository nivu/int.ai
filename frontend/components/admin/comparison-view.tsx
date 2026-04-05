"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Check, Minus } from "lucide-react";

// ---------------------------------------------------------------------------
// Candidate color palette (consistent across all charts)
// ---------------------------------------------------------------------------

const CANDIDATE_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkExperience {
  title?: string;
  company?: string;
  start_year?: number;
  end_year?: number | null;
  duration_years?: number;
}

interface InterviewReport {
  id: string;
  summary?: string | null;
  communication_score?: number | null;
  technical_score?: number | null;
  problem_solving_score?: number | null;
  cultural_fit_score?: number | null;
  overall_interview_score?: number | null;
}

export interface ComparisonCandidate {
  id: string;
  candidate: {
    id: string;
    full_name: string;
    email: string;
  };
  overall_score: number | null;
  skill_match_score: number | null;
  experience_match_score: number | null;
  culture_match_score: number | null;
  embedding_score: number | null;
  resume_data: {
    skills?: string[];
    current_role?: string | null;
    experience_years?: number | null;
    work_experience?: WorkExperience[];
  } | null;
  interview_reports?: InterviewReport[];
}

interface ComparisonViewProps {
  candidates: ComparisonCandidate[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function candidateName(c: ComparisonCandidate): string {
  return c.candidate?.full_name ?? "Unknown";
}

function scoreVal(v: number | null | undefined): number {
  return v ?? 0;
}

// ---------------------------------------------------------------------------
// 1. Score Overview Bar Chart
// ---------------------------------------------------------------------------

function ScoreOverview({ candidates }: { candidates: ComparisonCandidate[] }) {
  const metrics = [
    { key: "overall_score", label: "Overall" },
    { key: "skill_match_score", label: "Skill Match" },
    { key: "experience_match_score", label: "Experience" },
    { key: "culture_match_score", label: "Culture" },
    { key: "embedding_score", label: "Embedding" },
  ] as const;

  const data = metrics.map((m) => {
    const entry: Record<string, string | number> = { metric: m.label };
    candidates.forEach((c, i) => {
      entry[`candidate_${i}`] = scoreVal(c[m.key]);
    });
    return entry;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Score Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            {candidates.map((c, i) => (
              <Bar
                key={c.id}
                dataKey={`candidate_${i}`}
                name={candidateName(c)}
                fill={CANDIDATE_COLORS[i]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Radar Chart (interview dimensions)
// ---------------------------------------------------------------------------

function InterviewRadar({
  candidates,
}: {
  candidates: ComparisonCandidate[];
}) {
  // Only include candidates that have interview report data
  const withReports = candidates.filter(
    (c) => c.interview_reports && c.interview_reports.length > 0
  );

  if (withReports.length === 0) return null;

  const dimensions = [
    { key: "communication_score", label: "Communication" },
    { key: "technical_score", label: "Technical" },
    { key: "problem_solving_score", label: "Problem Solving" },
    { key: "cultural_fit_score", label: "Cultural Fit" },
  ] as const;

  // Try to import ScoreRadar from shared; fall back to inline RadarChart
  const data = dimensions.map((d) => {
    const entry: Record<string, string | number> = { dimension: d.label };
    candidates.forEach((c, i) => {
      const report = c.interview_reports?.[0];
      entry[`candidate_${i}`] = scoreVal(
        report?.[d.key] as number | null | undefined
      );
    });
    return entry;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interview Dimensions</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} />
            {candidates.map((c, i) => (
              <Radar
                key={c.id}
                name={candidateName(c)}
                dataKey={`candidate_${i}`}
                stroke={CANDIDATE_COLORS[i]}
                fill={CANDIDATE_COLORS[i]}
                fillOpacity={0.15}
              />
            ))}
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Skills Overlap Matrix
// ---------------------------------------------------------------------------

function SkillsOverlap({
  candidates,
}: {
  candidates: ComparisonCandidate[];
}) {
  // Collect all unique skills across candidates
  const allSkills = Array.from(
    new Set(candidates.flatMap((c) => c.resume_data?.skills ?? []))
  ).sort();

  if (allSkills.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills Overlap</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2 font-medium text-muted-foreground">
                Skill
              </th>
              {candidates.map((c, i) => (
                <th
                  key={c.id}
                  className="px-3 py-2 font-medium text-center"
                  style={{ color: CANDIDATE_COLORS[i] }}
                >
                  {candidateName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allSkills.map((skill) => (
              <tr key={skill} className="border-b last:border-0">
                <td className="px-3 py-1.5 font-medium">{skill}</td>
                {candidates.map((c) => {
                  const has = c.resume_data?.skills?.includes(skill);
                  return (
                    <td key={c.id} className="px-3 py-1.5 text-center">
                      {has ? (
                        <Check className="inline-block size-4 text-green-600" />
                      ) : (
                        <Minus className="inline-block size-4 text-muted-foreground/40" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Experience Timeline
// ---------------------------------------------------------------------------

function ExperienceTimeline({
  candidates,
}: {
  candidates: ComparisonCandidate[];
}) {
  // Build horizontal bar data: one entry per role per candidate
  const barData: {
    label: string;
    candidateIndex: number;
    duration: number;
    company: string;
    title: string;
  }[] = [];

  candidates.forEach((c, i) => {
    const experiences = c.resume_data?.work_experience ?? [];
    experiences.forEach((exp) => {
      const endYear = exp.end_year ?? new Date().getFullYear();
      const startYear = exp.start_year ?? endYear;
      const duration = exp.duration_years ?? endYear - startYear;
      barData.push({
        label: `${candidateName(c)} - ${exp.title ?? "Role"}`,
        candidateIndex: i,
        duration: Math.max(duration, 0.5),
        company: exp.company ?? "",
        title: exp.title ?? "",
      });
    });
  });

  if (barData.length === 0) return null;

  // For recharts horizontal bar, we build per-candidate data sets
  const chartData = barData.map((d) => ({
    name: `${d.title}${d.company ? ` @ ${d.company}` : ""}`,
    duration: d.duration,
    fill: CANDIDATE_COLORS[d.candidateIndex],
    candidateName: candidates[d.candidateIndex]
      ? candidateName(candidates[d.candidateIndex])
      : "",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Experience Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(barData.length * 36, 200)}>
          <BarChart data={chartData} layout="vertical" barSize={20}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              label={{ value: "Years", position: "insideBottom", offset: -5 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={220}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value, _name, entry) => {
                const payload = (entry as unknown as { payload?: { candidateName?: string } }).payload;
                return [`${value} years`, payload?.candidateName ?? ""];
              }}
            />
            <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. AI Summary Comparison
// ---------------------------------------------------------------------------

function AISummaryComparison({
  candidates,
}: {
  candidates: ComparisonCandidate[];
}) {
  const withSummaries = candidates.filter(
    (c) =>
      c.interview_reports &&
      c.interview_reports.length > 0 &&
      c.interview_reports[0].summary
  );

  if (withSummaries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Interview Summaries</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`grid gap-4 ${
            candidates.length === 2
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          }`}
        >
          {candidates.map((c, i) => {
            const summary = c.interview_reports?.[0]?.summary;
            return (
              <Card key={c.id} className="border-l-4" style={{ borderLeftColor: CANDIDATE_COLORS[i] }}>
                <CardHeader>
                  <CardTitle
                    className="text-sm"
                    style={{ color: CANDIDATE_COLORS[i] }}
                  >
                    {candidateName(c)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {summary ?? "No AI summary available."}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Comparison View
// ---------------------------------------------------------------------------

export default function ComparisonView({ candidates }: ComparisonViewProps) {
  return (
    <div className="space-y-6">
      {/* Candidate header chips */}
      <div className="flex flex-wrap gap-3">
        {candidates.map((c, i) => (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white"
            style={{ backgroundColor: CANDIDATE_COLORS[i] }}
          >
            <span>{candidateName(c)}</span>
          </div>
        ))}
      </div>

      <ScoreOverview candidates={candidates} />
      <InterviewRadar candidates={candidates} />
      <SkillsOverlap candidates={candidates} />
      <ExperienceTimeline candidates={candidates} />
      <AISummaryComparison candidates={candidates} />
    </div>
  );
}
