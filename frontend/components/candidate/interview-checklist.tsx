"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CheckStatus = "pending" | "checking" | "passed" | "failed";

interface InterviewChecklistProps {
  duration?: number;
  onReady: () => void;
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "checking") {
    return (
      <div className="h-5 w-5 flex items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }
  if (status === "passed") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
        >
          <path
            fillRule="evenodd"
            d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5 text-red-600 dark:text-red-400"
        >
          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted-foreground/30">
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
    </div>
  );
}

export function InterviewChecklist({
  duration = 30,
  onReady,
}: InterviewChecklistProps) {
  const [browserCheck, setBrowserCheck] = useState<CheckStatus>("pending");
  const [micCheck, setMicCheck] = useState<CheckStatus>("pending");
  const [micError, setMicError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  // Browser compatibility check
  useEffect(() => {
    setBrowserCheck("checking");
    const isModern =
      typeof window !== "undefined" &&
      typeof navigator?.mediaDevices?.getUserMedia === "function" &&
      typeof window.AudioContext !== "undefined" &&
      typeof RTCPeerConnection !== "undefined";
    // Slight delay so the spinner is visible
    const timer = setTimeout(() => {
      setBrowserCheck(isModern ? "passed" : "failed");
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Microphone permission check
  const requestMicrophone = useCallback(async () => {
    setMicCheck("checking");
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop tracks immediately -- we just needed permission
      stream.getTracks().forEach((t) => t.stop());
      setMicCheck("passed");
    } catch {
      setMicCheck("failed");
      setMicError("Please grant microphone access to continue.");
    }
  }, []);

  useEffect(() => {
    if (browserCheck === "passed") {
      requestMicrophone();
    }
  }, [browserCheck, requestMicrophone]);

  const canStart = micCheck === "passed" && consentChecked;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Before we begin</CardTitle>
        <CardDescription>
          Let&apos;s make sure everything is ready for your interview.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Explainer */}
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground leading-relaxed">
          You will have a voice conversation with an AI interviewer. It will ask
          questions based on your resume and the job description. Speak naturally
          and take your time with each answer.
        </div>

        {/* Checklist */}
        <div className="space-y-4">
          {/* 1. Browser */}
          <div className="flex items-start gap-3">
            <StatusIcon status={browserCheck} />
            <div className="space-y-0.5">
              <p
                className={cn(
                  "text-sm font-medium",
                  browserCheck === "failed" && "text-red-600 dark:text-red-400"
                )}
              >
                Browser compatibility
              </p>
              {browserCheck === "failed" && (
                <p className="text-xs text-red-500">
                  Please use a modern browser (Chrome, Firefox, Edge, or Safari
                  15+).
                </p>
              )}
            </div>
          </div>

          {/* 2. Microphone */}
          <div className="flex items-start gap-3">
            <StatusIcon status={micCheck} />
            <div className="space-y-0.5">
              <p
                className={cn(
                  "text-sm font-medium",
                  micCheck === "failed" && "text-red-600 dark:text-red-400"
                )}
              >
                Microphone access
              </p>
              {micError && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-red-500">{micError}</p>
                  <button
                    type="button"
                    onClick={requestMicrophone}
                    className="text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 3. Consent */}
          <div className="flex items-start gap-3">
            <StatusIcon status={consentChecked ? "passed" : "pending"} />
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-muted-foreground/30 accent-primary"
              />
              <span className="text-sm text-muted-foreground leading-relaxed">
                I consent to this interview being recorded and evaluated by AI. I
                understand the interview will last up to {duration} minutes.
              </span>
            </label>
          </div>
        </div>

        {/* Start button */}
        <div className="pt-2">
          <Button
            size="lg"
            disabled={!canStart}
            onClick={onReady}
            className="w-full sm:w-auto"
          >
            Start Interview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
