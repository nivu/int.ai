"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

// Formats a Date as the local "YYYY-MM-DDTHH:mm" value a datetime-local input expects.
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function ReopenJobDialog({
  jobId,
  closesAt,
}: {
  jobId: string;
  closesAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [noClosingDate, setNoClosingDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const existing = closesAt ? new Date(closesAt) : null;
      setDate(existing && existing > new Date() ? toLocalInputValue(existing) : "");
      setNoClosingDate(false);
      setError(null);
    }
  }

  // A past or empty date would be re-closed by auto_close_expired_posts() within 15 minutes.
  const dateIsFuture = date !== "" && new Date(date) > new Date();
  const canConfirm = noClosingDate || dateIsFuture;

  async function handleReopen() {
    // Re-check at click time: the date may have passed while the dialog was open.
    if (!noClosingDate && !(new Date(date) > new Date())) {
      setError("Choose a date in the future.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      // Only while still closed, so a job archived meanwhile stays archived.
      const { data: updated, error: updateError } = await supabase
        .from("hiring_posts")
        .update({
          status: "published",
          closes_at: noClosingDate ? null : new Date(date).toISOString(),
        })
        .eq("id", jobId)
        .eq("status", "closed")
        .select("id");
      if (updateError) throw new Error(updateError.message);
      if (!updated?.length) {
        throw new Error("This job is no longer closed. Refresh the page to see its status.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => handleOpenChange(true)}>
        Reopen
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen job</DialogTitle>
            <DialogDescription>
              The job is published again and its apply link accepts applications until the new
              closing date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen_closes_at">New closing date</Label>
            <Input
              id="reopen_closes_at"
              type="datetime-local"
              value={date}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setDate(e.target.value)}
              disabled={noClosingDate}
            />
            {!noClosingDate && date !== "" && !dateIsFuture && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Choose a date in the future.
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={noClosingDate}
              onChange={(e) => setNoClosingDate(e.target.checked)}
            />
            No closing date
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleReopen} disabled={saving || !canConfirm}>
              {saving ? "Reopening..." : "Reopen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
