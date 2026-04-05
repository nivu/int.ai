"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ComparisonView, {
  type ComparisonCandidate,
} from "@/components/admin/comparison-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Search, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types for the add-candidate search
// ---------------------------------------------------------------------------

interface CandidateSearchResult {
  id: string; // application id
  candidate_id: string;
  candidate: { id: string; full_name: string; email: string };
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const idsParam = searchParams.get("ids") ?? "";
  const candidateIds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [candidates, setCandidates] = useState<ComparisonCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-candidate dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CandidateSearchResult[]>(
    []
  );
  const [searching, setSearching] = useState(false);

  // ---------- Fetch candidates ----------

  const fetchCandidates = useCallback(async (ids: string[]) => {
    if (ids.length < 2) {
      setError("At least 2 candidates are required for comparison.");
      setLoading(false);
      return;
    }
    if (ids.length > 4) {
      setError("A maximum of 4 candidates can be compared at once.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("applications")
      .select(
        `
        id,
        overall_score,
        skill_match_score,
        experience_match_score,
        culture_match_score,
        embedding_score,
        resume_data,
        candidate:candidates!inner(id, full_name, email),
        interview_reports(
          id,
          summary,
          communication_score,
          technical_score,
          problem_solving_score,
          cultural_fit_score,
          overall_interview_score
        )
      `
      )
      .in("id", ids);

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    if (!data || data.length < 2) {
      setError(
        "Could not find enough candidates. Please verify the selected candidates exist."
      );
      setLoading(false);
      return;
    }

    setCandidates(data as unknown as ComparisonCandidate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCandidates(candidateIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam]);

  // ---------- Remove candidate ----------

  function handleRemove(applicationId: string) {
    const remaining = candidateIds.filter((id) => id !== applicationId);
    if (remaining.length < 2) {
      setError("At least 2 candidates are required for comparison.");
    }
    router.replace(`/candidates/compare?ids=${remaining.join(",")}`);
  }

  // ---------- Add candidate search ----------

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);

    const supabase = createClient();
    const { data } = await supabase
      .from("applications")
      .select("id, candidate_id, candidate:candidates!inner(id, full_name, email)")
      .or(
        `candidate.full_name.ilike.%${searchQuery}%,candidate.email.ilike.%${searchQuery}%`
      )
      .not("id", "in", `(${candidateIds.join(",")})`)
      .limit(10);

    setSearchResults((data as unknown as CandidateSearchResult[]) ?? []);
    setSearching(false);
  }

  function handleAddCandidate(applicationId: string) {
    const newIds = [...candidateIds, applicationId];
    setDialogOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    router.replace(`/candidates/compare?ids=${newIds.join(",")}`);
  }

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-pulse text-muted-foreground">
          Loading comparison...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/candidates")}
          >
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Button>
          <h1 className="text-xl font-semibold">Candidate Comparison</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Remove buttons per candidate */}
          {candidates.map((c, i) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
              style={{
                backgroundColor:
                  ["#6366f1", "#f59e0b", "#10b981", "#ef4444"][i],
              }}
            >
              {c.candidate?.full_name}
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-white/20 transition-colors"
                onClick={() => handleRemove(c.id)}
                aria-label={`Remove ${c.candidate?.full_name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          {/* Add candidate button */}
          {candidateIds.length < 4 && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Plus className="mr-1 size-4" />
                    Add Candidate
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Candidate</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSearch();
                        }}
                      />
                    </div>
                    <Button size="sm" onClick={handleSearch} disabled={searching}>
                      Search
                    </Button>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {searching && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        Searching...
                      </p>
                    )}
                    {!searching && searchResults.length === 0 && searchQuery && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No results found.
                      </p>
                    )}
                    {searchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => handleAddCandidate(r.id)}
                      >
                        <div>
                          <span className="font-medium">
                            {r.candidate?.full_name}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {r.candidate?.email}
                          </span>
                        </div>
                        <Plus className="size-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Comparison content */}
      {!error && candidates.length >= 2 && (
        <ComparisonView candidates={candidates} />
      )}
    </div>
  );
}
