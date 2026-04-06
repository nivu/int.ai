"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import TemplateForm, {
  type TemplateFormData,
} from "@/components/admin/template-form";
import { createClient } from "@/lib/supabase/client";
import type { InterviewTemplate } from "./page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TemplatesClient({
  templates: initialTemplates,
  orgId,
}: {
  templates: InterviewTemplate[];
  orgId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [templates, setTemplates] = useState(initialTemplates);
  const [loading, setLoading] = useState(false);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<InterviewTemplate | null>(
    null,
  );
  const [deleteTemplate, setDeleteTemplate] =
    useState<InterviewTemplate | null>(null);

  // ---- Create ----

  const handleCreate = useCallback(
    async (data: TemplateFormData) => {
      setLoading(true);
      try {
        const dbWeights = {
            technical: data.scoring_weights.technical / 100,
            depth: data.scoring_weights.depth / 100,
            communication: data.scoring_weights.communication / 100,
            relevance: data.scoring_weights.relevance / 100,
          };
        const { data: created, error } = await supabase
          .from("interview_templates")
          .insert({
            name: data.name,
            max_questions: data.max_questions,
            max_duration_minutes: data.max_duration_minutes,
            foundational_ratio: data.foundational_ratio,
            scoring_weights: dbWeights,
            must_ask_topics: data.must_ask_topics,
            is_preset: data.preset !== "none" && data.preset !== "custom",
            preset_role: data.preset === "none" ? null : data.preset,
            org_id: orgId,
          })
          .select()
          .single();

        if (error) throw error;

        setTemplates((prev) => [created as InterviewTemplate, ...prev]);
        setCreateOpen(false);
      } catch (err) {
        console.error("Failed to create template:", err);
      } finally {
        setLoading(false);
      }
    },
    [orgId, supabase],
  );

  // ---- Edit (inline dialog) ----

  const handleEdit = useCallback(
    async (data: TemplateFormData) => {
      if (!editTemplate) return;
      setLoading(true);
      try {
        const dbWeights = {
            technical: data.scoring_weights.technical / 100,
            depth: data.scoring_weights.depth / 100,
            communication: data.scoring_weights.communication / 100,
            relevance: data.scoring_weights.relevance / 100,
          };
        const { data: updated, error } = await supabase
          .from("interview_templates")
          .update({
            name: data.name,
            max_questions: data.max_questions,
            max_duration_minutes: data.max_duration_minutes,
            foundational_ratio: data.foundational_ratio,
            scoring_weights: dbWeights,
            must_ask_topics: data.must_ask_topics,
            is_preset: data.preset !== "none" && data.preset !== "custom",
            preset_role: data.preset === "none" ? null : data.preset,
          })
          .eq("id", editTemplate.id)
          .select()
          .single();

        if (error) throw error;

        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editTemplate.id ? (updated as InterviewTemplate) : t,
          ),
        );
        setEditTemplate(null);
      } catch (err) {
        console.error("Failed to update template:", err);
      } finally {
        setLoading(false);
      }
    },
    [editTemplate, supabase],
  );

  // ---- Clone ----

  const handleClone = useCallback(
    async (template: InterviewTemplate) => {
      setLoading(true);
      try {
        const { data: cloned, error } = await supabase
          .from("interview_templates")
          .insert({
            name: `${template.name} (Copy)`,
            max_questions: template.max_questions,
            max_duration_minutes: template.max_duration_minutes,
            foundational_ratio: template.foundational_ratio,
            scoring_weights: template.scoring_weights,
            must_ask_topics: template.must_ask_topics,
            is_preset: false,
            preset: template.preset,
            org_id: orgId,
          })
          .select()
          .single();

        if (error) throw error;

        const clonedTemplate = cloned as InterviewTemplate;
        setTemplates((prev) => [clonedTemplate, ...prev]);
        // Open edit dialog for the clone
        setEditTemplate(clonedTemplate);
      } catch (err) {
        console.error("Failed to clone template:", err);
      } finally {
        setLoading(false);
      }
    },
    [orgId, supabase],
  );

  // ---- Delete ----

  const handleDelete = useCallback(async () => {
    if (!deleteTemplate) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("interview_templates")
        .delete()
        .eq("id", deleteTemplate.id);

      if (error) throw error;

      setTemplates((prev) => prev.filter((t) => t.id !== deleteTemplate.id));
      setDeleteTemplate(null);
    } catch (err) {
      console.error("Failed to delete template:", err);
    } finally {
      setLoading(false);
    }
  }, [deleteTemplate, supabase]);

  // ---- Convert template to form initial data ----

  function toFormData(
    t: InterviewTemplate,
  ): Partial<TemplateFormData> {
    return {
      name: t.name,
      max_questions: t.max_questions,
      max_duration_minutes: t.max_duration_minutes,
      foundational_ratio: t.foundational_ratio,
      scoring_weights: t.scoring_weights,
      must_ask_topics: t.must_ask_topics,
      preset: (t.preset as TemplateFormData["preset"]) ?? "none",
    };
  }

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Interview Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your interview templates and presets
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Template</Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Templates</CardTitle>
          <CardAction>
            <span className="text-sm text-muted-foreground">
              {templates.length} total
            </span>
          </CardAction>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No interview templates found. Create your first template to get
              started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Questions</th>
                    <th className="pb-2 pr-4 font-medium">Duration</th>
                    <th className="pb-2 pr-4 font-medium">Preset</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">
                        {template.name}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {template.max_questions}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {template.max_duration_minutes} min
                      </td>
                      <td className="py-3 pr-4">
                        {template.is_preset ? (
                          <Badge variant="default">
                            {template.preset ?? "Preset"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDate(template.created_at)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditTemplate(template)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleClone(template)}
                            disabled={loading}
                          >
                            Clone
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteTemplate(template)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ Create Dialog ============ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Interview Template</DialogTitle>
            <DialogDescription>
              Configure a new interview template for your organization.
            </DialogDescription>
          </DialogHeader>
          <TemplateForm onSubmit={handleCreate} loading={loading} />
        </DialogContent>
      </Dialog>

      {/* ============ Edit Dialog ============ */}
      <Dialog
        open={editTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setEditTemplate(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Interview Template</DialogTitle>
            <DialogDescription>
              Update the template settings.
            </DialogDescription>
          </DialogHeader>
          {editTemplate && (
            <TemplateForm
              initialData={toFormData(editTemplate)}
              onSubmit={handleEdit}
              loading={loading}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ============ Delete Confirmation Dialog ============ */}
      <Dialog
        open={deleteTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTemplate(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTemplate?.name}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTemplate(null)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
