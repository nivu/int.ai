import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import TemplatesClient from "./templates-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterviewTemplate {
  id: string;
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
  is_preset: boolean;
  preset: string | null;
  created_at: string;
  org_id: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Page (server component)
// ---------------------------------------------------------------------------

export default async function TemplatesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch user profile to get org_id
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = profile?.org_id;

  // Build query
  let query = supabase
    .from("interview_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (orgId) {
    query = query.eq("org_id", orgId);
  }

  const { data: templates } = await query;

  return (
    <TemplatesClient
      templates={(templates as InterviewTemplate[]) ?? []}
      orgId={orgId ?? ""}
    />
  );
}
