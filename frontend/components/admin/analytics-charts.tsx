"use client";

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

interface AnalyticsChartsProps {
  funnelData: FunnelStage[];
  timingData: TimingData;
  scoreDistribution: ScoreBucket[];
  passRateData: PassRateSegment[];
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

const DONUT_COLORS = ["#22c55e", "#eab308", "#ef4444", "#94a3b8"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalyticsCharts({
  funnelData,
  timingData,
  scoreDistribution,
  passRateData,
}: AnalyticsChartsProps) {
  const totalPassRate = passRateData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
      {/* ---- Funnel Chart ---- */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Hiring Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {funnelData.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No funnel data available.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={funnelData}
                layout="vertical"
                margin={{ top: 5, right: 40, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="stage"
                  width={110}
                  tick={{ fontSize: 13 }}
                />
                <Tooltip
                  formatter={(value, _name, entry) => {
                    const stage = (entry as unknown as { payload: FunnelStage }).payload;
                    return [`${value} (${stage.conversionRate}%)`, "Candidates"];
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                  barSize={28}
                />
              </BarChart>
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
                {formatDuration(timingData.avgTimeToScreenHours)}
              </p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Avg Time to Interview
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {formatDuration(timingData.avgTimeToInterviewHours)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Pass Rate Donut ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Pass Rate</CardTitle>
        </CardHeader>
        <CardContent>
          {totalPassRate === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No decision data available.
            </p>
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
                      style={{
                        backgroundColor:
                          DONUT_COLORS[index % DONUT_COLORS.length],
                      }}
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

      {/* ---- Score Distribution Histogram ---- */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {scoreDistribution.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No score data available.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={scoreDistribution}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
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
