"use client";

import { useState, useCallback, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateFormData {
  name: string;
  max_questions: number;
  max_duration_minutes: number;
  foundational_ratio: number;
  scoring_weights: {
    technical: number;
    depth: number;
    communication: number;
    relevance: number;
  };
  must_ask_topics: string[];
  preset: PresetKey;
}

type PresetKey =
  | "none"
  | "backend_engineer"
  | "data_scientist"
  | "product_manager"
  | "custom";

export interface TemplateFormProps {
  initialData?: Partial<TemplateFormData>;
  onSubmit: (data: TemplateFormData) => Promise<void> | void;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const presetDefaults: Record<
  Exclude<PresetKey, "none" | "custom">,
  Omit<TemplateFormData, "preset">
> = {
  backend_engineer: {
    name: "Backend Engineer",
    max_questions: 10,
    max_duration_minutes: 45,
    foundational_ratio: 0.5,
    scoring_weights: { technical: 35, depth: 30, communication: 15, relevance: 20 },
    must_ask_topics: ["System Design", "APIs", "Databases", "Algorithms"],
  },
  data_scientist: {
    name: "Data Scientist",
    max_questions: 10,
    max_duration_minutes: 45,
    foundational_ratio: 0.6,
    scoring_weights: { technical: 30, depth: 30, communication: 15, relevance: 25 },
    must_ask_topics: ["Statistics", "ML Models", "Data Pipelines", "Python"],
  },
  product_manager: {
    name: "Product Manager",
    max_questions: 8,
    max_duration_minutes: 30,
    foundational_ratio: 0.4,
    scoring_weights: { technical: 15, depth: 25, communication: 35, relevance: 25 },
    must_ask_topics: ["Product Strategy", "Metrics", "User Research", "Prioritization"],
  },
};

const presetLabels: Record<PresetKey, string> = {
  none: "None",
  backend_engineer: "Backend Engineer",
  data_scientist: "Data Scientist",
  product_manager: "Product Manager",
  custom: "Custom",
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultFormData: TemplateFormData = {
  name: "",
  max_questions: 10,
  max_duration_minutes: 30,
  foundational_ratio: 0.6,
  scoring_weights: {
    technical: 25,
    depth: 25,
    communication: 25,
    relevance: 25,
  },
  must_ask_topics: [],
  preset: "none",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TemplateForm({
  initialData,
  onSubmit,
  loading,
}: TemplateFormProps) {
  const [form, setForm] = useState<TemplateFormData>({
    ...defaultFormData,
    ...initialData,
    scoring_weights: {
      ...defaultFormData.scoring_weights,
      ...initialData?.scoring_weights,
    },
    must_ask_topics: initialData?.must_ask_topics ?? defaultFormData.must_ask_topics,
  });

  const [topicInput, setTopicInput] = useState("");
  const [weightsError, setWeightsError] = useState("");

  // ---- helpers ----

  const update = useCallback(
    <K extends keyof TemplateFormData>(key: K, value: TemplateFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const updateWeight = useCallback(
    (key: keyof TemplateFormData["scoring_weights"], raw: string) => {
      const value = Math.max(0, Math.min(100, Number(raw) || 0));
      setForm((prev) => {
        const newWeights = { ...prev.scoring_weights, [key]: value };
        const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
        setWeightsError(total !== 100 ? `Weights sum to ${total}% (must be 100%)` : "");
        return { ...prev, scoring_weights: newWeights };
      });
    },
    [],
  );

  const addTopic = useCallback(
    (raw: string) => {
      const topics = raw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && !form.must_ask_topics.includes(t));
      if (topics.length > 0) {
        update("must_ask_topics", [...form.must_ask_topics, ...topics]);
      }
      setTopicInput("");
    },
    [form.must_ask_topics, update],
  );

  const removeTopic = useCallback(
    (topic: string) => {
      update(
        "must_ask_topics",
        form.must_ask_topics.filter((t) => t !== topic),
      );
    },
    [form.must_ask_topics, update],
  );

  const handleTopicKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTopic(topicInput);
    }
  };

  const handlePresetChange = useCallback(
    (value: string) => {
      const preset = value as PresetKey;
      if (preset === "none" || preset === "custom") {
        update("preset", preset);
        return;
      }
      const defaults = presetDefaults[preset];
      setForm((prev) => ({
        ...prev,
        ...defaults,
        preset,
      }));
      setWeightsError("");
    },
    [update],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = Object.values(form.scoring_weights).reduce((a, b) => a + b, 0);
    if (total !== 100) {
      setWeightsError(`Weights sum to ${total}% (must be 100%)`);
      return;
    }
    await onSubmit(form);
  };

  const foundationalPct = Math.round(form.foundational_ratio * 100);

  // ---- render ----

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ============ Preset Selector ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Preset</CardTitle>
          <CardDescription>
            Optionally start from a preset to pre-fill default values
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>Template Preset</Label>
            <Select value={form.preset} onValueChange={(value) => handlePresetChange(value ?? "none")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a preset" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(presetLabels) as PresetKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {presetLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ============ Basic Settings ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Settings</CardTitle>
          <CardDescription>
            Name and interview constraints
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              required
              placeholder="e.g. Senior Backend Interview"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>

          {/* Max questions & duration */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="max-questions">Max Questions</Label>
              <Input
                id="max-questions"
                type="number"
                min={5}
                max={15}
                required
                value={form.max_questions}
                onChange={(e) => update("max_questions", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Between 5 and 15</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-duration">Max Duration (minutes)</Label>
              <Input
                id="max-duration"
                type="number"
                min={15}
                max={60}
                required
                value={form.max_duration_minutes}
                onChange={(e) =>
                  update("max_duration_minutes", Number(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">Between 15 and 60</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============ Question Mix ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Question Mix</CardTitle>
          <CardDescription>
            Balance between foundational and project-based questions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Foundational / Project Ratio</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {foundationalPct}% foundational / {100 - foundationalPct}% project
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={foundationalPct}
              onChange={(e) =>
                update("foundational_ratio", Number(e.target.value) / 100)
              }
              className="w-full accent-primary"
            />
          </div>
        </CardContent>
      </Card>

      {/* ============ Scoring Weights ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Weights</CardTitle>
          <CardDescription>
            How each dimension is weighted in the final score (must sum to 100%)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["technical", "Technical"],
                ["depth", "Depth"],
                ["communication", "Communication"],
                ["relevance", "Relevance"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`weight-${key}`}>{label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`weight-${key}`}
                    type="number"
                    min={0}
                    max={100}
                    value={form.scoring_weights[key]}
                    onChange={(e) => updateWeight(key, e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
          {weightsError && (
            <p className="text-sm text-destructive">{weightsError}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Total:{" "}
            {Object.values(form.scoring_weights).reduce((a, b) => a + b, 0)}%
          </p>
        </CardContent>
      </Card>

      {/* ============ Must-Ask Topics ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Must-Ask Topics</CardTitle>
          <CardDescription>
            Topics the AI interviewer must cover during the interview
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="topics">Add Topics</Label>
            <Input
              id="topics"
              placeholder="Type a topic and press Enter to add"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={handleTopicKeyDown}
              onBlur={() => {
                if (topicInput.trim()) addTopic(topicInput);
              }}
            />
            {form.must_ask_topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.must_ask_topics.map((topic) => (
                  <Badge key={topic} variant="secondary">
                    {topic}
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center"
                      onClick={() => removeTopic(topic)}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : initialData
              ? "Update Template"
              : "Create Template"}
        </Button>
      </div>
    </form>
  );
}
