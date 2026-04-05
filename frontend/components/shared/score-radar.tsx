"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

interface ScoreDataItem {
  name: string;
  technical: number;
  depth: number;
  communication: number;
  relevance: number;
}

interface ScoreRadarProps {
  data: ScoreDataItem[];
}

const DIMENSIONS = [
  { key: "Technical Accuracy", dataKey: "technical" },
  { key: "Depth", dataKey: "depth" },
  { key: "Communication", dataKey: "communication" },
  { key: "Relevance", dataKey: "relevance" },
] as const;

const COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
];

export default function ScoreRadar({ data }: ScoreRadarProps) {
  // Reshape data for recharts: one entry per dimension
  const chartData = DIMENSIONS.map((dim) => {
    const entry: Record<string, string | number> = { dimension: dim.key };
    data.forEach((candidate) => {
      entry[candidate.name] = candidate[dim.dataKey as keyof ScoreDataItem] as number;
    });
    return entry;
  });

  const candidateNames = data.map((d) => d.name);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 10]}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickCount={6}
        />
        {candidateNames.map((name, i) => (
          <Radar
            key={name}
            name={name}
            dataKey={name}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.15}
          />
        ))}
        {candidateNames.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 12 }}
          />
        )}
      </RadarChart>
    </ResponsiveContainer>
  );
}
