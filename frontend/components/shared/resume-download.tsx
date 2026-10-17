"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backendFetch, BackendError } from "@/lib/api/backend";
import { createClient } from "@/lib/supabase/client";

interface ResumeLink {
  url: string;
  filename: string;
  expires_in: number;
}

interface ResumeExport extends ResumeLink {
  included: number;
  skipped: number;
}

async function fetchLink<T>(path: string, method: "GET" | "POST"): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return backendFetch<T>(path, { method, token: session?.access_token });
}

function errorText(err: unknown): string {
  return err instanceof BackendError
    ? err.detail
    : err instanceof Error
      ? err.message
      : String(err);
}

// The signed URL carries a download filename, so navigating to it saves the
// file without leaving the page.
function startDownload(url: string) {
  window.location.assign(url);
}

function useResumeDownload(applicationId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const link = await fetchLink<ResumeLink>(
        `/api/v1/applications/${applicationId}/resume`,
        "GET",
      );
      startDownload(link.url);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, download };
}

export function DownloadResumeButton({ applicationId }: { applicationId: string }) {
  const { busy, error, download: handleClick } = useResumeDownload(applicationId);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" onClick={handleClick} disabled={busy}>
        {busy ? "Preparing..." : "Download resume"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function ResumeIconButton({ applicationId }: { applicationId: string }) {
  const { busy, error, download } = useResumeDownload(applicationId);

  return (
    <div className="flex flex-col items-center">
      <Button
        variant="ghost"
        size="icon"
        onClick={download}
        disabled={busy}
        title={error ?? "Download resume"}
        aria-label="Download resume"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      </Button>
      {error && <span className="text-xs text-destructive whitespace-nowrap">Not available</span>}
    </div>
  );
}

export function DownloadAllResumesButton({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchLink<ResumeExport>(
        `/api/v1/jobs/${jobId}/resume-export`,
        "POST",
      );
      if (result.skipped > 0) {
        setMessage(
          `${result.included} resumes downloaded; ${result.skipped} not available.`,
        );
      }
      startDownload(result.url);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" onClick={handleClick} disabled={busy}>
        {busy ? "Building zip..." : "Download all resumes"}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
