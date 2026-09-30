"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Paperclip, X } from "lucide-react";
import { backendFetch, BackendError } from "@/lib/api/backend";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SortableTh,
  useSortState,
  useSortedRows,
  type SortAccessors,
} from "@/components/shared/sortable-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CandidateStatus =
  | "applied"
  | "screened"
  | "interview_sent"
  | "interviewed"
  | "shortlisted"
  | "resume_rejected"
  | "interview_rejected";

type StatusFilter =
  | "all"
  | "applied"
  | "screened"
  | "interview_sent"
  | "interviewed"
  | "shortlisted"
  | "resume_rejected"
  | "interview_rejected";

interface CandidateRow {
  application_id: string;
  candidate_id: string;
  name: string;
  email: string;
  job: string;
  key_skills: string[];
  overall: number | null;
  status: CandidateStatus;
  linkedin_url: string | null;
  applied_at: string | null;
}

interface JobCandidatesResponse {
  items: CandidateRow[];
}

interface BulkAttachmentDraft {
  filename: string;
  content_type: string;
  content_base64: string;
}

interface BulkEmailRequest {
  to: string[];
  subject: string;
  body: string;
  attachments: BulkAttachmentDraft[];
}

type EmailAudience = "shortlisted" | "rejected" | "selected";

const EMAIL_DIALOG_COPY: Record<EmailAudience, { title: string; audience: string }> = {
  shortlisted: { title: "Email Shortlisted Candidates", audience: "Shortlisted candidates" },
  rejected: {
    title: "Email Rejected Candidates",
    audience: "Rejected candidates (Resume Rejected + Interview Rejected)",
  },
  selected: { title: "Email Selected Candidates", audience: "selected candidates" },
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "applied", label: "Applied" },
  { value: "screened", label: "Screened" },
  { value: "interview_sent", label: "Interview Sent" },
  { value: "interviewed", label: "Interviewed" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "resume_rejected", label: "Resume Rejected" },
  { value: "interview_rejected", label: "Interview Rejected" },
];

const STATUS_LABELS: Record<CandidateStatus, string> = {
  applied: "Applied",
  screened: "Screened",
  interview_sent: "Interview Sent",
  interviewed: "Interviewed",
  shortlisted: "Shortlisted",
  resume_rejected: "Resume Rejected",
  interview_rejected: "Interview Rejected",
};

async function fetchJobCandidates(jobId: string): Promise<CandidateRow[]> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const response = await backendFetch<JobCandidatesResponse>(`/api/v1/jobs/${jobId}/candidates`, {
    token: session?.access_token,
  });
  return response.items ?? [];
}

function describeLoadError(error: unknown): string {
  if (error instanceof BackendError) return error.detail || error.message;
  return "Failed to load candidates for this job.";
}

function scorePercent(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatAppliedDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type CandidateSortKey =
  | "name"
  | "email"
  | "key_skills"
  | "overall"
  | "status"
  | "applied_at"
  | "linkedin_url";

const CANDIDATE_SORT_ACCESSORS: SortAccessors<CandidateRow, CandidateSortKey> = {
  name: (c) => c.name || null,
  email: (c) => c.email || null,
  key_skills: (c) => (c.key_skills || []).length,
  overall: (c) => c.overall,
  status: (c) => STATUS_LABELS[c.status],
  applied_at: (c) => (c.applied_at ? Date.parse(c.applied_at) : null),
  linkedin_url: (c) => (c.linkedin_url ? 1 : 0),
};

function isAcceptedAttachmentType(contentType: string): boolean {
  const allowedPrefixes = ["image/"];
  const allowedExact = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  return allowedPrefixes.some((prefix) => contentType.startsWith(prefix)) || allowedExact.has(contentType);
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read attachment"));
        return;
      }
      const [, base64 = ""] = result.split(",");
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Attachment upload failed"));
    reader.readAsDataURL(file);
  });
}

export default function JobCandidateManagementSection({ jobId }: { jobId: string }) {
  const [sourceCandidates, setSourceCandidates] = useState<CandidateRow[]>([]);
  const [isCandidatesLoading, setIsCandidatesLoading] = useState(true);
  const [candidatesLoadError, setCandidatesLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, toggleSort] = useSortState<CandidateSortKey>({ key: "applied_at", direction: "desc" });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [emailAudience, setEmailAudience] = useState<EmailAudience | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailAttachments, setEmailAttachments] = useState<BulkAttachmentDraft[]>([]);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);
  const [emailSendSuccess, setEmailSendSuccess] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Data fetching keeps setState inside promise callbacks only, so it can run
  // from an effect (react-hooks/set-state-in-effect).
  function runLoad() {
    return fetchJobCandidates(jobId)
      .then((items) => {
        setSourceCandidates(items);
        setCandidatesLoadError(null);
      })
      .catch((error: unknown) => setCandidatesLoadError(describeLoadError(error)))
      .finally(() => setIsCandidatesLoading(false));
  }

  function retryLoad() {
    setIsCandidatesLoading(true);
    setCandidatesLoadError(null);
    setSourceCandidates([]);
    setSelectedIds(new Set());
    void runLoad();
  }

  useEffect(() => {
    void runLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const filteredCandidates = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase();
    return sourceCandidates.filter((candidate) => {
      const statusMatch = statusFilter === "all" || candidate.status === statusFilter;
      if (!statusMatch) return false;
      if (!query) return true;
      const inName = candidate.name.toLowerCase().includes(query);
      const inEmail = candidate.email.toLowerCase().includes(query);
      const inSkills = (candidate.key_skills || []).some((skill) => skill.toLowerCase().includes(query));
      return inName || inEmail || inSkills;
    });
  }, [sourceCandidates, statusFilter, debouncedSearchQuery]);

  const sortedCandidates = useSortedRows(filteredCandidates, sort, CANDIDATE_SORT_ACCESSORS);

  const totalPages = Math.max(1, Math.ceil(sortedCandidates.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCandidates = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedCandidates.slice(start, start + pageSize);
  }, [sortedCandidates, safePage, pageSize]);

  const shortlistedRecipients = useMemo(
    () => sourceCandidates.filter((candidate) => candidate.status === "shortlisted"),
    [sourceCandidates]
  );
  const rejectedRecipients = useMemo(
    () => sourceCandidates.filter((candidate) => 
      candidate.status === "interview_rejected" || candidate.status === "resume_rejected"
    ),
    [sourceCandidates]
  );

  const selectedCandidates = useMemo(
    () => sourceCandidates.filter((candidate) => selectedIds.has(candidate.application_id)),
    [sourceCandidates, selectedIds]
  );
  const selectedLinkedinUrls = useMemo(
    () => selectedCandidates.map((candidate) => candidate.linkedin_url).filter((url): url is string => !!url),
    [selectedCandidates]
  );

  const allOnPageSelected =
    pagedCandidates.length > 0 && pagedCandidates.every((candidate) => selectedIds.has(candidate.application_id));
  const someOnPageSelected = pagedCandidates.some((candidate) => selectedIds.has(candidate.application_id));

  function toggleOne(applicationId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(applicationId);
      else next.delete(applicationId);
      return next;
    });
  }

  function toggleAllOnPage(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const candidate of pagedCandidates) {
        if (checked) next.add(candidate.application_id);
        else next.delete(candidate.application_id);
      }
      return next;
    });
  }

  function openSelectedLinkedinProfiles() {
    for (const url of selectedLinkedinUrls) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  const recipientsByAudience: Record<EmailAudience, CandidateRow[]> = {
    shortlisted: shortlistedRecipients,
    rejected: rejectedRecipients,
    selected: selectedCandidates,
  };

  const canSendShortlisted = shortlistedRecipients.length > 0 && !isCandidatesLoading;
  const canSendRejected = rejectedRecipients.length > 0 && !isCandidatesLoading;
  const sendDisabled = !emailSubject.trim() || !emailBody.trim() || isEmailSending;

  function resetEmailComposer() {
    setEmailSubject("");
    setEmailBody("");
    setEmailAttachments([]);
    setEmailSendError(null);
  }

  function openModal(kind: EmailAudience) {
    setEmailSendError(null);
    setEmailAudience(kind);
  }

  function closeModal() {
    setEmailAudience(null);
    resetEmailComposer();
  }

  async function addAttachments(files: FileList | null) {
    if (!files || files.length === 0) return;
    setEmailSendError(null);
    const next: BulkAttachmentDraft[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!isAcceptedAttachmentType(file.type)) {
          throw new Error(`Unsupported attachment type: ${file.name}`);
        }
        const content_base64 = await fileToBase64(file);
        next.push({
          filename: file.name,
          content_type: file.type,
          content_base64,
        });
      }
      setEmailAttachments((prev) => [...prev, ...next]);
    } catch (error) {
      setEmailSendError(error instanceof Error ? error.message : "Attachment upload failed");
    }
  }

  async function sendBulk(kind: EmailAudience) {
    const recipients = recipientsByAudience[kind].map((candidate) => candidate.email).filter(Boolean);

    if (recipients.length === 0) return;

    setIsEmailSending(true);
    setEmailSendError(null);
    setEmailSendSuccess(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const payload: BulkEmailRequest = {
        to: recipients,
        subject: emailSubject.trim(),
        body: emailBody.trim(),
        attachments: emailAttachments,
      };
      const result = await backendFetch<{ sent_count: number; failed_count: number }>(
        "/api/v1/email/bulk-custom",
        {
          method: "POST",
          body: JSON.stringify(payload),
          token: session?.access_token,
        }
      );
      const message =
        result.failed_count > 0
          ? `Sent to ${result.sent_count} candidates (${result.failed_count} failed).`
          : `Sent to ${result.sent_count} candidates.`;
      setEmailSendSuccess(message);
      setEmailAudience(null);
      resetEmailComposer();
    } catch (error) {
      if (error instanceof BackendError) {
        setEmailSendError(error.detail || "Failed to send email.");
      } else {
        setEmailSendError("Failed to send email.");
      }
    } finally {
      setIsEmailSending(false);
    }
  }

  const showNoCandidates = !isCandidatesLoading && sourceCandidates.length === 0;
  const showNoMatches = !isCandidatesLoading && sourceCandidates.length > 0 && filteredCandidates.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate Management Table</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {emailSendSuccess && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {emailSendSuccess}
          </div>
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:max-w-sm">
            <Input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search name, email, or key skills..."
              disabled={isCandidatesLoading}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as StatusFilter);
                setPage(1);
              }}
              disabled={isCandidatesLoading}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              disabled={!canSendShortlisted}
              title={!canSendShortlisted ? "No shortlisted candidates for this role" : undefined}
              onClick={() => openModal("shortlisted")}
            >
              Send Bulk Email to Shortlisted Candidates
            </Button>

            <Button
              variant="outline"
              disabled={!canSendRejected}
              title={!canSendRejected ? "No rejected candidates for this role" : undefined}
              onClick={() => openModal("rejected")}
            >
              Send Bulk Email to Rejected Candidates
            </Button>
          </div>
        </div>

        {isCandidatesLoading && (
          <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading candidates...
          </div>
        )}

        {candidatesLoadError && !isCandidatesLoading && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{candidatesLoadError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={retryLoad}>
              Retry
            </Button>
          </div>
        )}

        {showNoCandidates && (
          <div className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">
            No candidates have applied for this job posting yet.
          </div>
        )}

        {showNoMatches && (
          <div className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">
            No candidates match the current search or filter.
          </div>
        )}

        {!isCandidatesLoading && !candidatesLoadError && !showNoCandidates && !showNoMatches && (
          <>
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openModal("selected")}>
                    Send Email to Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedLinkedinUrls.length === 0}
                    title={
                      selectedLinkedinUrls.length === 0
                        ? "None of the selected candidates has a LinkedIn profile"
                        : "Opens each profile in a new tab. Allow pop-ups for this site if only one opens."
                    }
                    onClick={openSelectedLinkedinProfiles}
                  >
                    <ExternalLink className="mr-1 size-3" />
                    Open LinkedIn Profiles ({selectedLinkedinUrls.length})
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all candidates on this page"
                        className="size-4 cursor-pointer accent-primary"
                        checked={allOnPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                        }}
                        onChange={(event) => toggleAllOnPage(event.target.checked)}
                      />
                    </th>
                    <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortableTh label="Email" sortKey="email" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortableTh label="Key Skills" sortKey="key_skills" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortableTh label="Overall" sortKey="overall" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortableTh label="Applied" sortKey="applied_at" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortableTh label="LinkedIn" sortKey="linkedin_url" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCandidates.map((candidate) => (
                    <tr
                      key={candidate.application_id}
                      className={`border-t ${selectedIds.has(candidate.application_id) ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${candidate.name || candidate.email}`}
                          className="size-4 cursor-pointer accent-primary"
                          checked={selectedIds.has(candidate.application_id)}
                          onChange={(event) => toggleOne(candidate.application_id, event.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-2">{candidate.name || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{candidate.email || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(candidate.key_skills || []).slice(0, 4).map((skill) => (
                            <Badge key={`${candidate.application_id}-${skill}`} variant="secondary">
                              {skill}
                            </Badge>
                          ))}
                          {(candidate.key_skills || []).length === 0 && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium">{scorePercent(candidate.overall)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{STATUS_LABELS[candidate.status]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {formatAppliedDate(candidate.applied_at)}
                      </td>
                      <td className="px-3 py-2">
                        {candidate.linkedin_url ? (
                          <a
                            href={candidate.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                          >
                            Profile
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/candidates/${candidate.application_id}`}>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Showing {(safePage - 1) * pageSize + 1}-
                {Math.min(safePage * pageSize, filteredCandidates.length)} of {filteredCandidates.length}
              </p>
              <div className="flex items-center gap-2">
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setPage(1);
                  }}
                  disabled={isCandidatesLoading}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / page</SelectItem>
                    <SelectItem value="20">20 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={emailAudience !== null} onOpenChange={(open) => (!open ? closeModal() : undefined)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{emailAudience ? EMAIL_DIALOG_COPY[emailAudience].title : ""}</DialogTitle>
            <DialogDescription>
              {emailAudience
                ? `Sending to ${recipientsByAudience[emailAudience].length} ${EMAIL_DIALOG_COPY[emailAudience].audience}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Subject"
              value={emailSubject}
              onChange={(event) => setEmailSubject(event.target.value)}
            />
            <Textarea
              placeholder="Email body"
              rows={8}
              value={emailBody}
              onChange={(event) => setEmailBody(event.target.value)}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Attachments</label>
              <Input
                type="file"
                multiple
                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => void addAttachments(event.target.files)}
              />
              {emailAttachments.length > 0 && (
                <div className="space-y-1">
                  {emailAttachments.map((attachment, index) => (
                    <div key={`${attachment.filename}-${index}`} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3" />
                        {attachment.filename}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setEmailAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {emailSendError && <p className="text-sm text-red-600">{emailSendError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={isEmailSending}>
              Cancel
            </Button>
            <Button
              disabled={sendDisabled}
              onClick={() => {
                if (emailAudience) void sendBulk(emailAudience);
              }}
            >
              {isEmailSending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
