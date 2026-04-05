"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import JobForm, {
  type HiringPostFormData,
} from "@/components/admin/job-form";

export default function NewJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: HiringPostFormData) => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get team member record for org_id and member id
      const { data: member, error: memberError } = await supabase
        .from("team_members")
        .select("id, org_id")
        .eq("user_id", user.id)
        .single();

      if (memberError || !member) {
        console.error("Member query error:", memberError, "user.id:", user.id);
        throw new Error(`Team member not found. Error: ${memberError?.message || "no rows"}. User ID: ${user.id}`);
      }

      const now = new Date().toISOString();
      const isPublish = data.publish_now;

      const { data: post, error } = await supabase
        .from("hiring_posts")
        .insert({
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
          status: isPublish ? "published" : "draft",
          published_at: isPublish ? now : null,
          closes_at: data.closes_at
            ? new Date(data.closes_at).toISOString()
            : null,
          org_id: member.org_id,
          created_by: member.id,
        })
        .select("id")
        .single();

      if (error) throw error;

      router.push(`/jobs/${post.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Failed to create job:", message);
      alert(`Failed to create job: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Create New Hiring Post
        </h1>
        <p className="text-sm text-muted-foreground">
          Fill in the details below to create a new job posting
        </p>
      </div>

      <JobForm onSubmit={handleSubmit} loading={loading} />
    </div>
  );
}
