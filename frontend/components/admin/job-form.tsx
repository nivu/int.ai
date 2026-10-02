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
import { X, Plus } from "lucide-react";

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
  screening_threshold: number;
  skill_cutoff: number;
  experience_cutoff: number;
  culture_cutoff: number;
  culture_expectation: string;
  // interview settings
  max_questions: number;
  max_duration_minutes: number;
  custom_questions: string[];
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
  screening_threshold: 70,
  skill_cutoff: 70,
  experience_cutoff: 60,
  culture_cutoff: 50,
  culture_expectation: "",
  max_questions: 10,
  max_duration_minutes: 45,
  custom_questions: [],
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
    custom_questions: initialData?.custom_questions ?? [],
  });

  const [skillInput, setSkillInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");

  // ---- helpers ----

  const update = useCallback(
    <K extends keyof HiringPostFormData>(key: K, value: HiringPostFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
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


  const addQuestion = useCallback(() => {
    const q = questionInput.trim();
    if (q && !form.custom_questions.includes(q)) {
      update("custom_questions", [...form.custom_questions, q]);
    }
    setQuestionInput("");
  }, [questionInput, form.custom_questions, update]);

  const removeQuestion = useCallback(
    (index: number) => {
      update(
        "custom_questions",
        form.custom_questions.filter((_, i) => i !== index),
      );
    },
    [form.custom_questions, update],
  );

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
          {/* Dimension cut-offs */}
          <p className="text-xs text-muted-foreground">
            Cut-offs set what this role expects on each dimension. They are
            shown as met or missed on each candidate&apos;s score breakdown and
            do not change the overall score.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["skill_cutoff", "Skill Cut-off", "% of required skills covered, named or implied"],
                ["experience_cutoff", "Experience Cut-off", "Higher for a specific role and years; lower for diverse backgrounds"],
                ["culture_cutoff", "Culture Cut-off", "How closely the candidate should fit the culture below"],
              ] as const
            ).map(([key, label, hint]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type="number"
                  min={0}
                  max={100}
                  value={form[key]}
                  onChange={(e) => update(key, Number(e.target.value))}
                  onBlur={(e) => update(key, Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                />
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>

          {/* Culture expectation (internal) */}
          <div className="space-y-1.5">
            <Label htmlFor="culture_expectation">Culture Expectation (internal)</Label>
            <Textarea
              id="culture_expectation"
              rows={3}
              placeholder="e.g. Professional and client-facing, or hacker-style self-directed builder"
              value={form.culture_expectation}
              onChange={(e) => update("culture_expectation", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used to score culture match. Not shown on the job post or to candidates.
            </p>
          </div>

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
              Candidates whose overall score is below this threshold will be
              auto-rejected. Overall = resume similarity 15% + skill 35% +
              experience 35% + culture 15%.
            </p>
          </div>

          {/* Interview Settings */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="max_questions">Number of Questions</Label>
              <Input
                id="max_questions"
                type="number"
                min={1}
                max={30}
                value={form.max_questions}
                onChange={(e) => update("max_questions", Number(e.target.value))}
                onBlur={(e) => update("max_questions", Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
              />
              <p className="text-xs text-muted-foreground">
                How many questions the AI interviewer will ask.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_duration_minutes">Max Duration (minutes)</Label>
              <Input
                id="max_duration_minutes"
                type="number"
                min={5}
                max={120}
                value={form.max_duration_minutes}
                onChange={(e) => update("max_duration_minutes", Number(e.target.value))}
                onBlur={(e) => update("max_duration_minutes", Math.min(120, Math.max(5, Number(e.target.value) || 5)))}
              />
              <p className="text-xs text-muted-foreground">
                Interview ends automatically after this duration.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============ Custom Interview Questions ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Interview Questions</CardTitle>
          <CardDescription>
            Add specific questions you want the AI interviewer to ask. These will
            be asked first, within the total question limit above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Why do you want to work at our company?"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addQuestion();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addQuestion} className="shrink-0">
              <Plus className="size-4 mr-1" />
              Add
            </Button>
          </div>
          {form.custom_questions.length > 0 && (
            <ol className="space-y-2">
              {form.custom_questions.map((q, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="mt-0.5 shrink-0 font-medium text-muted-foreground">
                    {i + 1}.
                  </span>
                  <span className="flex-1">{q}</span>
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeQuestion(i)}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          {form.custom_questions.length >= form.max_questions && (
            <p className="text-xs text-destructive">
              You have added {form.custom_questions.length} custom question(s), which fills all{" "}
              {form.max_questions} question slot(s). Increase &ldquo;Number of Questions&rdquo; to
              leave room for AI-generated questions.
            </p>
          )}
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
