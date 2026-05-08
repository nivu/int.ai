"use client";

import { useTheme } from "next-themes";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunnelStage {
  stage: string;
  count: number;
  conversionRate: number;
}

export interface TimingData {
  avgTimeToScreenHours: number;
  avgTimeToInterviewHours: number;
}

export interface ScoreBucket {
  range: string;
  count: number;
}

export interface PassRateSegment {
  label: string;
  value: number;
}

export interface ScoreDimensionEntry {
  dimension: string;
  score: number; // 0.0–1.0
}

export interface TrendPoint {
  week: string; // ISO date of week start (YYYY-MM-DD)
  count: number;
}

interface AnalyticsChartsProps {
  funnelData: FunnelStage[];
  timingData: TimingData;
  scoreDistribution: ScoreBucket[];
  passRateData: PassRateSegment[];
  scoreDimensions: ScoreDimensionEntry[];
  trendData: TrendPoint[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

function fmtWeek(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const DONUT_COLORS = ["#22c55e", "#eab308", "#ef4444", "#94a3b8"];
const DIM_COLORS: Record<string, string> = {
  "Skill Match": "#6366f1",
  Experience: "#f59e0b",
  Culture: "#10b981",
  Overall: "#3b82f6",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalyticsCharts({
  funnelData,
  timingData,
  scoreDistribution,
  passRateData,
  scoreDimensions,
  trendData,
}: AnalyticsChartsProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const tickFill = isDark ? "#a1a1aa" : "#71717a";
  const gridStroke = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  // Use explicit hex instead of hsl(var(--primary)) — CSS vars here hold full oklch values,
  // not hsl components, so hsl(var(--primary)) resolves to black.
  const primaryChartColor = isDark ? "#60a5fa" : "#3b82f6";
  const tooltipStyle = {
    contentStyle: {
      backgroundColor: isDark ? "#1c1c1e" : "#ffffff",
      border: `1px solid ${isDark ? "#3f3f46" : "#e4e4e7"}`,
      color: isDark ? "#f4f4f5" : "#18181b",
      borderRadius: "6px",
      fontSize: "12px",
    },
    labelStyle: { color: isDark ? "#a1a1aa" : "#71717a" },
  };

  const totalPassRate = passRateData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">

      {/* ---- Hiring Funnel ---- */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Hiring Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {funnelData.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No funnel data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={funnelData}
                layout="vertical"
                margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
                <XAxis type="number" tick={{ fontSize: 13, fill: tickFill }} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  width={110}
                  tick={{ fontSize: 13, fill: tickFill }}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, _name, entry) => {
                    const stage = (entry as unknown as { payload: FunnelStage }).payload;
                    return [`${value} (${stage.conversionRate}%)`, "Candidates"];
                  }}
                />
                <Bar
                  dataKey="count"
                  fill={primaryChartColor}
                  radius={[0, 4, 4, 0]}
                  barSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---- Applications Over Time ---- */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Applications Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length < 2 ? (
            <p className="py-8 text-center text-muted-foreground">
              Not enough data for a trend — need at least 2 weeks of applications.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={trendData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis
                  dataKey="week"
                  tickFormatter={fmtWeek}
                  tick={{ fontSize: 12, fill: tickFill }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: tickFill }} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(label) => `Week of ${fmtWeek(label as string)}`}
                  formatter={(v) => [v, "Applications"]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={primaryChartColor}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Applications"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---- Timing Metrics ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Timing Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Avg Time to Screen</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {timingData.avgTimeToScreenHours > 0
                  ? formatDuration(timingData.avgTimeToScreenHours)
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Avg Time to Interview</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {timingData.avgTimeToInterviewHours > 0
                  ? formatDuration(timingData.avgTimeToInterviewHours)
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Pass Rate Donut ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Screening Decisions</CardTitle>
        </CardHeader>
        <CardContent>
          {totalPassRate === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No decision data available.</p>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={passRateData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {passRateData.map((entry, index) => (
                      <Cell
                        key={entry.label}
                        fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value) => {
                      const num = Number(value) || 0;
                      const pct =
                        totalPassRate > 0
                          ? ((num / totalPassRate) * 100).toFixed(1)
                          : "0";
                      return [`${num} (${pct}%)`, "Count"];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 text-sm">
                {passRateData.map((entry, index) => (
                  <div key={entry.label} className="flex items-center gap-2">
                    <span
                      className="inline-block size-3 rounded-full"
                      style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
                    />
                    <span>
                      {entry.label}:{" "}
                      <span className="font-medium tabular-nums">
                        {totalPassRate > 0
                          ? ((entry.value / totalPassRate) * 100).toFixed(1)
                          : "0"}
                        %
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Avg Score by Dimension ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Avg Score by Dimension</CardTitle>
        </CardHeader>
        <CardContent>
          {scoreDimensions.every((d) => d.score === 0) ? (
            <p className="py-8 text-center text-muted-foreground">No screened candidates yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={scoreDimensions.map((d) => ({
                  ...d,
                  scorePct: Math.round(d.score * 100),
                }))}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="dimension" tick={{ fontSize: 12, fill: tickFill }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: tickFill }} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, "Avg Score"]} />
                <Bar dataKey="scorePct" radius={[4, 4, 0, 0]} name="Avg Score">
                  {scoreDimensions.map((entry) => (
                    <Cell
                      key={entry.dimension}
                      fill={DIM_COLORS[entry.dimension] ?? primaryChartColor}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---- Score Distribution Histogram ---- */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {scoreDistribution.every((b) => b.count === 0) ? (
            <p className="py-8 text-center text-muted-foreground">No score data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={scoreDistribution}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="range" tick={{ fontSize: 12, fill: tickFill }} unit="%" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: tickFill }} />
                <Tooltip {...tooltipStyle} formatter={(v) => [v, "Candidates"]} />
                <Bar
                  dataKey="count"
                  fill={primaryChartColor}
                  radius={[4, 4, 0, 0]}
                  name="Candidates"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
