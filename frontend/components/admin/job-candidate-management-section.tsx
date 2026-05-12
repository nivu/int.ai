"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { backendFetch, BackendError } from "@/lib/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function scorePercent(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

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

  const [isShortlistedModalOpen, setIsShortlistedModalOpen] = useState(false);
  const [isRejectedModalOpen, setIsRejectedModalOpen] = useState(false);
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

  async function loadCandidates() {
    setIsCandidatesLoading(true);
    setCandidatesLoadError(null);
    setSourceCandidates([]);
    try {
      const response = await backendFetch<JobCandidatesResponse>(`/api/v1/jobs/${jobId}/candidates`);
      setSourceCandidates(response.items ?? []);
    } catch (error) {
      if (error instanceof BackendError) {
        setCandidatesLoadError(error.detail || error.message);
      } else {
        setCandidatesLoadError("Failed to load candidates for this job.");
      }
    } finally {
      setIsCandidatesLoading(false);
    }
  }

  useEffect(() => {
    void loadCandidates();
  }, [jobId]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery, statusFilter]);

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

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCandidates = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredCandidates.slice(start, start + pageSize);
  }, [filteredCandidates, safePage, pageSize]);

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

  const canSendShortlisted = shortlistedRecipients.length > 0 && !isCandidatesLoading;
  const canSendRejected = rejectedRecipients.length > 0 && !isCandidatesLoading;
  const sendDisabled = !emailSubject.trim() || !emailBody.trim() || isEmailSending;

  function resetEmailComposer() {
    setEmailSubject("");
    setEmailBody("");
    setEmailAttachments([]);
    setEmailSendError(null);
  }

  function closeModal(kind: "shortlisted" | "rejected") {
    if (kind === "shortlisted") setIsShortlistedModalOpen(false);
    else setIsRejectedModalOpen(false);
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

  async function sendBulk(kind: "shortlisted" | "rejected") {
    const recipients =
      kind === "shortlisted"
        ? shortlistedRecipients.map((candidate) => candidate.email)
        : rejectedRecipients.map((candidate) => candidate.email);

    if (recipients.length === 0) return;

    setIsEmailSending(true);
    setEmailSendError(null);
    setEmailSendSuccess(null);
    try {
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
        }
      );
      const message =
        result.failed_count > 0
          ? `Sent to ${result.sent_count} candidates (${result.failed_count} failed).`
          : `Sent to ${result.sent_count} candidates.`;
      setEmailSendSuccess(message);
      if (kind === "shortlisted") setIsShortlistedModalOpen(false);
      else setIsRejectedModalOpen(false);
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
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name, email, or key skills..."
              disabled={isCandidatesLoading}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
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
              onClick={() => {
                setEmailSendError(null);
                setIsShortlistedModalOpen(true);
              }}
            >
              Send Bulk Email to Shortlisted Candidates
            </Button>

            <Button
              variant="outline"
              disabled={!canSendRejected}
              title={!canSendRejected ? "No rejected candidates for this role" : undefined}
              onClick={() => {
                setEmailSendError(null);
                setIsRejectedModalOpen(true);
              }}
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
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadCandidates()}>
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
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Key Skills</th>
                    <th className="px-3 py-2 font-medium">Overall</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCandidates.map((candidate) => (
                    <tr key={candidate.application_id} className="border-t">
                      <td className="px-3 py-2">{candidate.name || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{candidate.email || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{candidate.job || "—"}</td>
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

      <Dialog open={isShortlistedModalOpen} onOpenChange={(open) => (!open ? closeModal("shortlisted") : setIsShortlistedModalOpen(open))}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Email Shortlisted Candidates</DialogTitle>
            <DialogDescription>
              Sending to {shortlistedRecipients.length} Shortlisted candidates
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
            <Button variant="outline" onClick={() => closeModal("shortlisted")} disabled={isEmailSending}>
              Cancel
            </Button>
            <Button disabled={sendDisabled} onClick={() => void sendBulk("shortlisted")}>
              {isEmailSending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectedModalOpen} onOpenChange={(open) => (!open ? closeModal("rejected") : setIsRejectedModalOpen(open))}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Email Rejected Candidates</DialogTitle>
            <DialogDescription>
              Sending to {rejectedRecipients.length} Rejected candidates (Resume Rejected + Interview Rejected)
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
            <Button variant="outline" onClick={() => closeModal("rejected")} disabled={isEmailSending}>
              Cancel
            </Button>
            <Button disabled={sendDisabled} onClick={() => void sendBulk("rejected")}>
              {isEmailSending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
