"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { backendFetch, BackendError } from "@/lib/api/backend";
import { createClient } from "@/lib/supabase/client";

export function RequestChangeDialog({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSent(false);
      setError(null);
    }
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      await backendFetch(`/api/v1/client/jobs/${jobId}/change-request`, {
        method: "POST",
        token: session?.access_token,
        body: JSON.stringify({ message }),
      });
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(
        err instanceof BackendError
          ? err.detail
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => handleOpenChange(true)}>
        Request a change
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a change</DialogTitle>
            <DialogDescription>
              Describe the change you would like to this job. Your message is emailed to the
              team, and replies come back to your email address.
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <p className="text-sm text-green-700 dark:text-green-400">Sent to the Nunnari team.</p>
          ) : (
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="What should change?"
            />
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
              {sent ? "Close" : "Cancel"}
            </Button>
            {!sent && (
              <Button onClick={handleSend} disabled={sending || message.trim().length === 0}>
                {sending ? "Sending..." : "Send"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
