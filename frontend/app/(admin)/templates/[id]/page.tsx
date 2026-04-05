import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditTemplateClient from "./edit-template-client";

// ---------------------------------------------------------------------------
// Server component — fetches the template and passes to client shell
// ---------------------------------------------------------------------------

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: template, error } = await supabase
    .from("interview_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !template) {
    notFound();
  }

  return <EditTemplateClient template={template} />;
}
