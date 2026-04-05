"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import JobForm, {
  type HiringPostFormData,
} from "@/components/admin/job-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HiringPost {
  id: string;
  title: string;
  department: string;
  location_type: string;
  location: string;
  description: string;
  required_skills: string[];
  experience_min: number;
  experience_max: number;
  education_requirements: string;
  scoring_weights: {
    skill_match: number;
    experience_match: number;
    culture_match: number;
  };
  screening_threshold: number;
  status: "draft" | "published" | "closed" | "archived";
  published_at: string | null;
  scheduled_publish_at: string | null;
  closes_at: string | null;
  share_slug: string | null;
  created_at: string;
  [key: string]: unknown;
}

const statusVariant: Record<
  HiringPost["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  published: "default",
  closed: "destructive",
  archived: "outline",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JobDetailClient({
  post,
  applicationCount,
}: {
  post: HiringPost;
  applicationCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const supabase = createClient();

  // ---- status transitions ----

  const updateStatus = async (
    newStatus: HiringPost["status"],
    extra: Record<string, unknown> = {},
  ) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("hiring_posts")
        .update({ status: newStatus, ...extra })
        .eq("id", post.id);
      if (error) throw error;
      router.refresh();
    } catch (err) {
      console.error("Status update failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = () =>
    updateStatus("published", { published_at: new Date().toISOString() });

  const handleClose = () => updateStatus("closed");

  const handleArchive = () => updateStatus("archived");

  // ---- edit submit ----

  const handleEditSubmit = async (data: HiringPostFormData) => {
    setLoading(true);
    try {
      const isPublish = data.publish_now;

      const { error } = await supabase
        .from("hiring_posts")
        .update({
          title: data.title,
          department: data.department,
          location_type: data.location_type,
          location: data.location,
          description: data.description,
          required_skills: data.required_skills,
          experience_min: data.experience_min,
          experience_max: data.experience_max,
          education_requirements: data.education_requirements,
          scoring_weights: data.scoring_weights,
          screening_threshold: data.screening_threshold,
          interview_template_id: data.interview_template_id || null,
          status: isPublish ? "published" : post.status,
          published_at:
            isPublish && !post.published_at
              ? new Date().toISOString()
              : post.published_at,
          closes_at: data.closes_at
            ? new Date(data.closes_at).toISOString()
            : null,
        })
        .eq("id", post.id)
        .select();

      if (error) {
        console.error("Supabase update error:", error.message, error.code, error.details);
        throw new Error(error.message);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Update failed:", message);
      alert(`Update failed: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // ---- shareable link ----

  const shareUrl =
    typeof window !== "undefined" && post.share_slug
      ? `${window.location.origin}/apply/${post.share_slug}`
      : null;

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---- initial data for edit form ----

  const initialData: Partial<HiringPostFormData> = {
    title: post.title,
    department: post.department,
    location_type: post.location_type as HiringPostFormData["location_type"],
    location: post.location,
    description: post.description,
    required_skills: post.required_skills ?? [],
    experience_min: post.experience_min,
    experience_max: post.experience_max,
    education_requirements: post.education_requirements,
    scoring_weights: post.scoring_weights,
    screening_threshold: post.screening_threshold,
    publish_now: post.status === "published",
    scheduled_publish_at: post.scheduled_publish_at ?? "",
    closes_at: post.closes_at ?? "",
  };

  // ---- render ----

  if (editing) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Edit Job</h1>
          <Button variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        <JobForm
          initialData={initialData}
          onSubmit={handleEditSubmit}
          loading={loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{post.title}</h1>
            <Badge variant={statusVariant[post.status]}>{post.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {post.department ? `${post.department} · ` : ""}
            {post.location_type}
            {post.location ? ` · ${post.location}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {post.status === "draft" && (
            <Button onClick={handlePublish} disabled={loading}>
              Publish
            </Button>
          )}
          {post.status === "published" && (
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={loading}
            >
              Close
            </Button>
          )}
          {post.status === "closed" && (
            <Button variant="outline" onClick={handleArchive} disabled={loading}>
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Applications</p>
            <p className="text-2xl font-bold tabular-nums">
              {applicationCount}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Experience</p>
            <p className="text-2xl font-bold tabular-nums">
              {post.experience_min}–{post.experience_max} yrs
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Screening Threshold
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {post.screening_threshold}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Share link */}
      {shareUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Share Link</CardTitle>
            <CardDescription>
              Share this URL with candidates to apply
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Label className="sr-only" htmlFor="share-url">
                Share URL
              </Label>
              <Input id="share-url" readOnly value={shareUrl} />
              <Button variant="outline" onClick={copyLink}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Job Description</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">
            {post.description || "No description provided."}
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      {post.required_skills && post.required_skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Required Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {post.required_skills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scoring weights */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Weights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3 text-sm">
            <div>
              <span className="text-muted-foreground">Skill Match:</span>{" "}
              <span className="font-medium">
                {(post.scoring_weights.skill_match * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Experience Match:</span>{" "}
              <span className="font-medium">
                {(post.scoring_weights.experience_match * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Culture Match:</span>{" "}
              <span className="font-medium">
                {(post.scoring_weights.culture_match * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
