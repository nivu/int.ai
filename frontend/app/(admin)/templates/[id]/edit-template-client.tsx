"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import TemplateForm, {
  type TemplateFormData,
} from "@/components/admin/template-form";
import { createClient } from "@/lib/supabase/client";
import type { InterviewTemplate } from "../page";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditTemplateClient({
  template,
}: {
  template: InterviewTemplate;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const initialData: Partial<TemplateFormData> = {
    name: template.name,
    max_questions: template.max_questions,
    max_duration_minutes: template.max_duration_minutes,
    foundational_ratio: template.foundational_ratio,
    scoring_weights: template.scoring_weights,
    must_ask_topics: template.must_ask_topics,
    preset: (template.preset as TemplateFormData["preset"]) ?? "none",
  };

  const handleSubmit = useCallback(
    async (data: TemplateFormData) => {
      setLoading(true);
      try {
        const { error } = await supabase
          .from("interview_templates")
          .update({
            name: data.name,
            max_questions: data.max_questions,
            max_duration_minutes: data.max_duration_minutes,
            foundational_ratio: data.foundational_ratio,
            scoring_weights: data.scoring_weights,
            must_ask_topics: data.must_ask_topics,
            is_preset: data.preset !== "none" && data.preset !== "custom",
            preset: data.preset === "none" ? null : data.preset,
          })
          .eq("id", template.id);

        if (error) throw error;

        router.push("/templates");
        router.refresh();
      } catch (err) {
        console.error("Failed to update template:", err);
      } finally {
        setLoading(false);
      }
    },
    [template.id, supabase, router],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit Template</h1>
        <p className="text-sm text-muted-foreground">
          Update &quot;{template.name}&quot;
        </p>
      </div>
      <TemplateForm
        initialData={initialData}
        onSubmit={handleSubmit}
        loading={loading}
      />
    </div>
  );
}
