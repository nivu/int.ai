"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { backendFetch } from "@/lib/api/backend";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types (mirror backend/app/services/usage_report.py)
// ---------------------------------------------------------------------------

interface UsageOperation {
  provider: string;
  operation: string;
  calls: number;
  errors: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  duration_seconds: number;
  characters: number;
}

interface UsageSummary {
  since: string;
  until: string;
  total_cost_usd: number;
  total_calls: number;
  error_calls: number;
  by_day: { date: string; cost_usd: number }[];
  by_provider: { provider: string; calls: number; errors: number; cost_usd: number }[];
  by_operation: UsageOperation[];
  by_job: { job_id: string | null; title: string; calls: number; cost_usd: number }[];
}

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  deepgram: "Deepgram",
  livekit: "LiveKit",
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatUsd(value: number) {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

// Operation names recorded by the backend (see record_usage call sites).
const OPERATION_LABELS: Record<string, string> = {
  parse_resume: "Resume parsing",
  score_resume: "Resume scoring",
  embed_resume: "Resume embedding",
  embed_job_description: "Job description embedding",
  generate_job_description: "Job description drafting",
  interview_question: "Interview question generation",
  interview_llm: "Interview conversation",
  interview_stt: "Interview speech-to-text",
  interview_tts: "Interview text-to-speech",
  interview_session: "Interview agent time",
  interview_summary: "Interview summary",
  "evaluate:score_question": "Interview answer scoring",
  "evaluate:synthesis": "Interview evaluation report",
  "evaluate:candidate_email": "Candidate email drafting",
};

function formatOperation(op: string) {
  if (OPERATION_LABELS[op]) return OPERATION_LABELS[op];
  const text = op.replace(/[_:]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatQuantity(op: UsageOperation) {
  const parts: string[] = [];
  const tokens = op.input_tokens + op.output_tokens;
  if (tokens > 0) parts.push(`${tokens.toLocaleString()} tokens`);
  if (op.duration_seconds > 0) parts.push(`${(op.duration_seconds / 60).toFixed(1)} min`);
  if (op.characters > 0) parts.push(`${op.characters.toLocaleString()} chars`);
  return parts.join(" · ") || "—";
}

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UsageTab() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const tickFill = isDark ? "#a1a1aa" : "#71717a";
  const gridStroke = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  // Same explicit hex as analytics-charts.tsx (CSS vars hold oklch values).
  const barColor = isDark ? "#60a5fa" : "#3b82f6";
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

  const [days, setDays] = useState("30");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const data = await backendFetch<UsageSummary>(`/api/v1/usage?days=${days}`, {
          token: session?.access_token,
        });
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          // Don't leave the previous period's numbers under the new period label.
          setSummary(null);
          setError(err instanceof Error ? err.message : "Failed to load usage.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const chartData = (summary?.by_day ?? []).map((d) => ({
    date: formatDay(d.date),
    cost: d.cost_usd,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Usage</h2>
          <p className="text-sm text-muted-foreground">
            Estimated AI and voice spend for resume screening and interviews. Costs are estimates
            from list prices, not your provider invoice.
          </p>
        </div>
        <Select
          value={days}
          onValueChange={(val) => {
            setLoading(true);
            setDays(val as string);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue>{PERIODS.find((p) => p.value === days)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && !summary ? (
        <p className="py-8 text-center text-muted-foreground">Loading usage...</p>
      ) : summary ? (
        <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          {/* Headline numbers */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-medium uppercase tracking-wide">
                  Estimated cost
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums mt-1">
                  {formatUsd(summary.total_cost_usd)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-medium uppercase tracking-wide">
                  AI and voice calls
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums mt-1">
                  {summary.total_calls.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-medium uppercase tracking-wide">
                  Failed calls
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums mt-1">
                  {summary.error_calls.toLocaleString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  Many are retried automatically; see Dashboard for candidates that need attention
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Daily cost */}
          <Card>
            <CardHeader>
              <CardTitle>Estimated cost per day</CardTitle>
              <CardDescription>Days are in UTC</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.total_calls === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No usage recorded in this period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: tickFill }}
                      interval="preserveStartEnd"
                      minTickGap={16}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: tickFill }}
                      tickFormatter={(v: number) => formatUsd(v)}
                      width={64}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      cursor={{ fill: gridStroke }}
                      formatter={(value) => [formatUsd(Number(value)), "Estimated cost"]}
                    />
                    <Bar dataKey="cost" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* By operation */}
          <Card>
            <CardHeader>
              <CardTitle>By operation</CardTitle>
              <CardDescription>What each call was for, most expensive first</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.by_operation.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No usage yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Operation</th>
                        <th className="pb-2 pr-4 font-medium">Provider</th>
                        <th className="pb-2 pr-4 font-medium text-right">Calls</th>
                        <th className="pb-2 pr-4 font-medium text-right">Failed</th>
                        <th className="pb-2 pr-4 font-medium">Usage</th>
                        <th className="pb-2 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_operation.map((op) => (
                        <tr key={`${op.provider}:${op.operation}`} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{formatOperation(op.operation)}</td>
                          <td className="py-2 pr-4">{PROVIDER_LABELS[op.provider] ?? op.provider}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{op.calls.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{op.errors.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{formatQuantity(op)}</td>
                          <td className="py-2 text-right tabular-nums">{formatUsd(op.cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* By provider */}
            <Card>
              <CardHeader>
                <CardTitle>By provider</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.by_provider.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No usage yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Provider</th>
                        <th className="pb-2 pr-4 font-medium text-right">Calls</th>
                        <th className="pb-2 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_provider.map((p) => (
                        <tr key={p.provider} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{PROVIDER_LABELS[p.provider] ?? p.provider}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{p.calls.toLocaleString()}</td>
                          <td className="py-2 text-right tabular-nums">{formatUsd(p.cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* By job */}
            <Card>
              <CardHeader>
                <CardTitle>By job</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.by_job.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No usage yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Job</th>
                        <th className="pb-2 pr-4 font-medium text-right">Calls</th>
                        <th className="pb-2 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_job.map((j) => (
                        <tr key={j.job_id ?? "none"} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{j.title}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{j.calls.toLocaleString()}</td>
                          <td className="py-2 text-right tabular-nums">{formatUsd(j.cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
