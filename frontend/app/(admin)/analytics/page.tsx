"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import AnalyticsCharts, {
  type FunnelStage,
  type TimingData,
  type ScoreBucket,
  type PassRateSegment,
  type ScoreDimensionEntry,
  type TrendPoint,
} from "@/components/admin/analytics-charts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HiringPost {
  id: string;
  title: string;
}

interface KpiData {
  totalApplicants: number;
  screenedPct: number;
  avgOverallScore: number | null;
  hiredCount: number;
  advanceCount: number;
}

// ---------------------------------------------------------------------------
// Score buckets helper
// ---------------------------------------------------------------------------

const SCORE_RANGES = [
  "0-10",
  "10-20",
  "20-30",
  "30-40",
  "40-50",
  "50-60",
  "60-70",
  "70-80",
  "80-90",
  "90-100",
];

function bucketScore(score: number): string {
  const idx = Math.min(Math.floor(score / 10), 9);
  return SCORE_RANGES[idx];
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const supabase = createClient();

  // Filters
  const [jobs, setJobs] = useState<HiringPost[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // KPIs
  const [kpi, setKpi] = useState<KpiData>({
    totalApplicants: 0,
    screenedPct: 0,
    avgOverallScore: null,
    hiredCount: 0,
    advanceCount: 0,
  });

  // Chart data
  const [funnelData, setFunnelData] = useState<FunnelStage[]>([]);
  const [timingData, setTimingData] = useState<TimingData>({
    avgTimeToScreenHours: 0,
    avgTimeToInterviewHours: 0,
  });
  const [scoreDistribution, setScoreDistribution] = useState<ScoreBucket[]>([]);
  const [passRateData, setPassRateData] = useState<PassRateSegment[]>([]);
  const [scoreDimensions, setScoreDimensions] = useState<ScoreDimensionEntry[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- Fetch jobs for selector ----
  useEffect(() => {
    async function loadJobs() {
      const { data } = await supabase
        .from("hiring_posts")
        .select("id, title")
        .order("created_at", { ascending: false });
      setJobs((data as HiringPost[]) ?? []);
    }
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Fetch analytics data ----
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);

    try {
      let appsQuery = supabase.from("applications").select(
        "id, status, overall_score, skill_match_score, experience_match_score, culture_match_score, decision, created_at, screening_completed_at, interview_invited_at, hiring_post_id"
      );

      if (selectedJobId !== "all") {
        appsQuery = appsQuery.eq("hiring_post_id", selectedJobId);
      }
      if (startDate) {
        appsQuery = appsQuery.gte("created_at", startDate);
      }
      if (endDate) {
        appsQuery = appsQuery.lte("created_at", `${endDate}T23:59:59`);
      }

      const { data: applications } = await appsQuery;
      const apps = (applications ?? []) as Array<{
        id: string;
        status: string;
        overall_score: number | null;
        skill_match_score: number | null;
        experience_match_score: number | null;
        culture_match_score: number | null;
        decision: string | null;
        created_at: string;
        screening_completed_at: string | null;
        interview_invited_at: string | null;
        hiring_post_id: string;
      }>;

      // ---- KPIs ----
      const totalApps = apps.length;
      const screenedCount = apps.filter((a) => a.status !== "applied").length;
      const hiredCount = apps.filter((a) => a.status === "hired").length;
      const advanceCount = apps.filter((a) => a.decision === "advance").length;
      const scored = apps.filter((a) => a.overall_score != null);
      const avgScore =
        scored.length > 0
          ? scored.reduce((s, a) => s + a.overall_score!, 0) / scored.length
          : null;

      setKpi({
        totalApplicants: totalApps,
        screenedPct: totalApps > 0 ? (screenedCount / totalApps) * 100 : 0,
        avgOverallScore: avgScore,
        hiredCount,
        advanceCount,
      });

      // ---- Funnel ----
      // Statuses that count as "at or past" each funnel stage.
      // Rejections (resume_rejected, interview_rejected) are exits —
      // they count for Applied only, not for later stages.
      const funnelStages: { label: string; test: (s: string) => boolean }[] = [
        {
          label: "Applied",
          test: () => true, // every application counts
        },
        {
          label: "Screened",
          test: (s) =>
            ["screened", "interview_sent", "interviewed", "shortlisted", "hired"].includes(s),
        },
        {
          label: "Interviewed",
          test: (s) =>
            ["interview_sent", "interviewed", "shortlisted", "hired"].includes(s),
        },
        {
          label: "Shortlisted",
          test: (s) => ["shortlisted", "hired"].includes(s),
        },
        {
          label: "Hired",
          test: (s) => s === "hired",
        },
      ];

      const funnel: FunnelStage[] = funnelStages.map(({ label, test }) => {
        const count = apps.filter((a) => test(a.status)).length;
        const conversionRate =
          totalApps > 0 ? Math.round((count / totalApps) * 100) : 0;
        return { stage: label, count, conversionRate };
      });
      setFunnelData(funnel);

      // ---- Timing ----
      const screenTimes: number[] = [];
      const interviewTimes: number[] = [];

      for (const app of apps) {
        if (app.screening_completed_at) {
          const diff =
            (new Date(app.screening_completed_at).getTime() -
              new Date(app.created_at).getTime()) /
            3_600_000;
          screenTimes.push(diff);
        }
        if (app.interview_invited_at && app.screening_completed_at) {
          const diff =
            (new Date(app.interview_invited_at).getTime() -
              new Date(app.screening_completed_at).getTime()) /
            3_600_000;
          interviewTimes.push(diff);
        }
      }

      const avg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      setTimingData({
        avgTimeToScreenHours: avg(screenTimes),
        avgTimeToInterviewHours: avg(interviewTimes),
      });

      // ---- Score distribution ----
      const buckets: Record<string, number> = {};
      for (const r of SCORE_RANGES) buckets[r] = 0;

      for (const app of apps) {
        if (app.overall_score != null) {
          const key = bucketScore(app.overall_score * 100);
          buckets[key] = (buckets[key] ?? 0) + 1;
        }
      }

      setScoreDistribution(
        SCORE_RANGES.map((range) => ({ range, count: buckets[range] }))
      );

      // ---- Pass rate ----
      const decisions: Record<string, number> = { advance: 0, borderline: 0, reject: 0 };
      for (const app of apps) {
        if (app.decision && decisions[app.decision] !== undefined) {
          decisions[app.decision]++;
        }
      }
      setPassRateData([
        { label: "Advance", value: decisions.advance },
        { label: "Borderline", value: decisions.borderline },
        { label: "Reject", value: decisions.reject },
      ]);

      // ---- Score dimensions (avg per dimension, screened only) ----
      const screenedApps = apps.filter((a) => a.overall_score != null);
      const avgDim = (key: keyof typeof screenedApps[0]) => {
        const vals = screenedApps
          .map((a) => a[key] as number | null)
          .filter((v): v is number => v != null);
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      };
      setScoreDimensions([
        { dimension: "Skill Match", score: avgDim("skill_match_score") },
        { dimension: "Experience", score: avgDim("experience_match_score") },
        { dimension: "Culture", score: avgDim("culture_match_score") },
        { dimension: "Overall", score: avgDim("overall_score") },
      ]);

      // ---- Applications over time (weekly buckets) ----
      const weekMap: Record<string, number> = {};
      for (const app of apps) {
        const d = new Date(app.created_at);
        // ISO week start (Monday)
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d.setDate(diff));
        const key = weekStart.toISOString().slice(0, 10);
        weekMap[key] = (weekMap[key] ?? 0) + 1;
      }
      const trend: TrendPoint[] = Object.entries(weekMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, count]) => ({ week, count }));
      setTrendData(trend);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedJobId, startDate, endDate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // ---- Export ----

  function handleExportCSV() {
    const rows = funnelData.map((f) => ({
      stage: f.stage,
      count: f.count,
      conversion_rate: `${f.conversionRate}%`,
    }));
    downloadCSV("analytics-funnel.csv", rows);
  }

  function handleExportPDF() {
    window.print();
  }

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Hiring pipeline metrics and insights
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" onClick={handleExportCSV}>
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleExportPDF}>
            Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border p-4 print:hidden">
        <div className="min-w-[200px]">
          <Label htmlFor="job-select">Job</Label>
          <Select
            value={selectedJobId}
            onValueChange={(val) => setSelectedJobId(val as string)}
          >
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="All Jobs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="start-date">Start Date</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="end-date">End Date</Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading analytics...
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <KpiCard label="Total Applicants" value={String(kpi.totalApplicants)} />
            <KpiCard
              label="Screened"
              value={`${Math.round(kpi.screenedPct)}%`}
              sub="of all applicants"
            />
            <KpiCard
              label="Avg Score"
              value={kpi.avgOverallScore != null ? `${Math.round(kpi.avgOverallScore * 100)}%` : "—"}
              sub="overall match"
            />
            <KpiCard
              label="Advanced"
              value={String(kpi.advanceCount)}
              sub="screening decision"
            />
            <KpiCard label="Hired" value={String(kpi.hiredCount)} />
          </div>

          {/* Charts */}
          <AnalyticsCharts
            funnelData={funnelData}
            timingData={timingData}
            scoreDistribution={scoreDistribution}
            passRateData={passRateData}
            scoreDimensions={scoreDimensions}
            trendData={trendData}
          />
        </>
      )}
    </div>
  );
}
