"use client";

import { useState, useCallback, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

export interface HiringPostFormData {
  title: string;
  department: string;
  location_type: "remote" | "onsite" | "hybrid";
  location: string;
  description: string;
  required_skills: string[];
  experience_min: number;
  experience_max: number;
  education_requirements: string;
  // screening config
  scoring_weights: {
    skill_match: number;
    experience_match: number;
    culture_match: number;
  };
  screening_threshold: number;
  // publish settings
  publish_now: boolean;
  scheduled_publish_at: string;
  closes_at: string;
}

export interface JobFormProps {
  initialData?: Partial<HiringPostFormData>;
  onSubmit: (data: HiringPostFormData) => Promise<void> | void;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultFormData: HiringPostFormData = {
  title: "",
  department: "",
  location_type: "remote",
  location: "",
  description: "",
  required_skills: [],
  experience_min: 0,
  experience_max: 0,
  education_requirements: "",
  scoring_weights: {
    skill_match: 0.4,
    experience_match: 0.35,
    culture_match: 0.25,
  },
  screening_threshold: 70,
  publish_now: true,
  scheduled_publish_at: "",
  closes_at: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JobForm({ initialData, onSubmit, loading }: JobFormProps) {
  const [form, setForm] = useState<HiringPostFormData>({
    ...defaultFormData,
    ...initialData,
    scoring_weights: {
      ...defaultFormData.scoring_weights,
      ...initialData?.scoring_weights,
    },
  });

  const [skillInput, setSkillInput] = useState("");

  // ---- helpers ----

  const update = useCallback(
    <K extends keyof HiringPostFormData>(key: K, value: HiringPostFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const updateWeight = useCallback(
    (key: keyof HiringPostFormData["scoring_weights"], raw: number) => {
      setForm((prev) => {
        const others = Object.keys(prev.scoring_weights).filter(
          (k) => k !== key,
        ) as (keyof HiringPostFormData["scoring_weights"])[];

        const clamped = Math.min(Math.max(raw, 0), 1);
        const remaining = 1 - clamped;
        const othersSum =
          others.reduce((s, k) => s + prev.scoring_weights[k], 0) || 1;

        const newWeights = { ...prev.scoring_weights, [key]: clamped };
        others.forEach((k) => {
          newWeights[k] = parseFloat(
            ((prev.scoring_weights[k] / othersSum) * remaining).toFixed(2),
          );
        });

        // ensure the total is exactly 1.0
        const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
        if (total !== 1) {
          newWeights[others[0]] = parseFloat(
            (newWeights[others[0]] + (1 - total)).toFixed(2),
          );
        }

        return { ...prev, scoring_weights: newWeights };
      });
    },
    [],
  );

  const addSkill = useCallback(
    (raw: string) => {
      const tags = raw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && !form.required_skills.includes(t));
      if (tags.length > 0) {
        update("required_skills", [...form.required_skills, ...tags]);
      }
      setSkillInput("");
    },
    [form.required_skills, update],
  );

  const removeSkill = useCallback(
    (skill: string) => {
      update(
        "required_skills",
        form.required_skills.filter((s) => s !== skill),
      );
    },
    [form.required_skills, update],
  );

  const handleSkillKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(skillInput);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  // ---- render ----

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ============ Job Details ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>
            Basic information about the hiring post
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              placeholder="e.g. Senior Full-Stack Engineer"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </div>

          {/* Department */}
          <div className="space-y-1.5">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              placeholder="e.g. Engineering"
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
            />
          </div>

          {/* Location type + location */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Location Type</Label>
              <Select
                value={form.location_type}
                onValueChange={(val) =>
                  update("location_type", val as HiringPostFormData["location_type"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="onsite">Onsite</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g. San Francisco, CA"
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Job Description</Label>
            <Textarea
              id="description"
              rows={6}
              placeholder="Enter the full job description..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          {/* Required Skills */}
          <div className="space-y-1.5">
            <Label htmlFor="skills">Required Skills</Label>
            <Input
              id="skills"
              placeholder="Type a skill and press Enter or comma to add"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={handleSkillKeyDown}
              onBlur={() => {
                if (skillInput.trim()) addSkill(skillInput);
              }}
            />
            {form.required_skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.required_skills.map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center"
                      onClick={() => removeSkill(skill)}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Experience */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exp_min">Min Experience (years)</Label>
              <Input
                id="exp_min"
                type="number"
                min={0}
                value={form.experience_min}
                onChange={(e) => update("experience_min", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp_max">Max Experience (years)</Label>
              <Input
                id="exp_max"
                type="number"
                min={0}
                value={form.experience_max}
                onChange={(e) => update("experience_max", Number(e.target.value))}
              />
            </div>
          </div>

          {/* Education */}
          <div className="space-y-1.5">
            <Label htmlFor="education">Education Requirements</Label>
            <Input
              id="education"
              placeholder="e.g. Bachelor's in Computer Science or equivalent"
              value={form.education_requirements}
              onChange={(e) => update("education_requirements", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ============ Screening Config ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Screening Configuration</CardTitle>
          <CardDescription>
            Adjust how candidates are scored during AI screening
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Scoring weights */}
          {(
            [
              ["skill_match", "Skill Match"],
              ["experience_match", "Experience Match"],
              ["culture_match", "Culture Match"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {(form.scoring_weights[key] * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(form.scoring_weights[key] * 100)}
                onChange={(e) => updateWeight(key, Number(e.target.value) / 100)}
                className="w-full accent-primary"
              />
            </div>
          ))}

          {/* Threshold */}
          <div className="space-y-1.5">
            <Label htmlFor="threshold">Screening Threshold</Label>
            <Input
              id="threshold"
              type="number"
              min={0}
              max={100}
              value={form.screening_threshold}
              onChange={(e) =>
                update("screening_threshold", Number(e.target.value))
              }
            />
            <p className="text-xs text-muted-foreground">
              Candidates scoring below this threshold will be auto-rejected.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ============ Publish Settings ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Publish Settings</CardTitle>
          <CardDescription>
            Control when and how the job goes live
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Publish toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.publish_now}
              onCheckedChange={(checked: boolean) => update("publish_now", checked)}
            />
            <Label>{form.publish_now ? "Publish Now" : "Schedule"}</Label>
          </div>

          {/* Schedule inputs */}
          {!form.publish_now && (
            <div className="space-y-1.5">
              <Label htmlFor="scheduled">Scheduled Publish Date &amp; Time</Label>
              <Input
                id="scheduled"
                type="datetime-local"
                value={form.scheduled_publish_at}
                onChange={(e) =>
                  update("scheduled_publish_at", e.target.value)
                }
              />
            </div>
          )}

          {/* Deadline */}
          <div className="space-y-1.5">
            <Label htmlFor="closes_at">Application Deadline</Label>
            <Input
              id="closes_at"
              type="datetime-local"
              value={form.closes_at}
              onChange={(e) => update("closes_at", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : initialData
              ? "Update Job"
              : form.publish_now
                ? "Create & Publish"
                : "Create as Draft"}
        </Button>
      </div>
    </form>
  );
}
