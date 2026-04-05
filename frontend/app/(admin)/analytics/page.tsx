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
import AnalyticsCharts, {
  type FunnelStage,
  type TimingData,
  type ScoreBucket,
  type PassRateSegment,
} from "@/components/admin/analytics-charts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HiringPost {
  id: string;
  title: string;
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
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const supabase = createClient();

  // Filters
  const [jobs, setJobs] = useState<HiringPost[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Chart data
  const [funnelData, setFunnelData] = useState<FunnelStage[]>([]);
  const [timingData, setTimingData] = useState<TimingData>({
    avgTimeToScreenHours: 0,
    avgTimeToInterviewHours: 0,
  });
  const [scoreDistribution, setScoreDistribution] = useState<ScoreBucket[]>([]);
  const [passRateData, setPassRateData] = useState<PassRateSegment[]>([]);
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
      // Build base query filters
      let appsQuery = supabase.from("applications").select(
        "id, status, overall_score, screening_decision, created_at, screened_at, interview_sent_at"
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
        screening_decision: string | null;
        created_at: string;
        screened_at: string | null;
        interview_sent_at: string | null;
      }>;

      // ---- Funnel ----
      const statusOrder = [
        "applied",
        "screened",
        "interview_scheduled",
        "shortlisted",
        "hired",
      ];
      const statusLabels: Record<string, string> = {
        applied: "Applied",
        screened: "Screened",
        interview_scheduled: "Interviewed",
        shortlisted: "Shortlisted",
        hired: "Hired",
      };

      // Each stage counts candidates AT or PAST that stage
      const statusIndex = (s: string) => statusOrder.indexOf(s);
      const totalApps = apps.length;

      const funnel: FunnelStage[] = statusOrder.map((stage, idx) => {
        const count = apps.filter((a) => statusIndex(a.status) >= idx).length;
        const conversionRate =
          totalApps > 0 ? Math.round((count / totalApps) * 100) : 0;
        return {
          stage: statusLabels[stage] ?? stage,
          count,
          conversionRate,
        };
      });
      setFunnelData(funnel);

      // ---- Timing ----
      const screenTimes: number[] = [];
      const interviewTimes: number[] = [];

      for (const app of apps) {
        if (app.screened_at) {
          const diff =
            (new Date(app.screened_at).getTime() -
              new Date(app.created_at).getTime()) /
            3_600_000;
          screenTimes.push(diff);
        }
        if (app.interview_sent_at && app.screened_at) {
          const diff =
            (new Date(app.interview_sent_at).getTime() -
              new Date(app.screened_at).getTime()) /
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
          const key = bucketScore(app.overall_score);
          buckets[key] = (buckets[key] ?? 0) + 1;
        }
      }

      setScoreDistribution(
        SCORE_RANGES.map((range) => ({ range, count: buckets[range] }))
      );

      // ---- Pass rate ----
      const decisions: Record<string, number> = {
        advance: 0,
        borderline: 0,
        reject: 0,
      };

      for (const app of apps) {
        if (app.screening_decision && decisions[app.screening_decision] !== undefined) {
          decisions[app.screening_decision]++;
        }
      }

      setPassRateData([
        { label: "Advance", value: decisions.advance },
        { label: "Borderline", value: decisions.borderline },
        { label: "Reject", value: decisions.reject },
      ]);
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

      {/* Charts */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading analytics...
        </div>
      ) : (
        <AnalyticsCharts
          funnelData={funnelData}
          timingData={timingData}
          scoreDistribution={scoreDistribution}
          passRateData={passRateData}
        />
      )}
    </div>
  );
}
