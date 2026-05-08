"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { key: "applied", label: "Applied" },
  { key: "screening_complete", label: "Screening Complete" },
  { key: "interview_invited", label: "Interview Invited" },
  { key: "interview_complete", label: "Interview Complete" },
  { key: "decision_pending", label: "Decision Pending" },
  { key: "outcome", label: "Outcome" },
] as const;

export type ApplicationStatus =
  | (typeof STEPS)[number]["key"]
  | "screened"
  | "interview_sent"
  | "interviewed"
  | "shortlisted"
  | "rejected"
  | "resume_rejected"
  | "interview_rejected"
  | "hired"
  | "screening_error";

interface StatusTrackerProps {
  currentStatus: string;
}

const REJECTED_STATUSES = new Set(["resume_rejected", "interview_rejected", "rejected"]);

// How far in the pipeline the candidate got before rejection
const REJECTION_STEP: Record<string, string> = {
  resume_rejected: "screening_complete", // rejected after screening — they made it that far
  interview_rejected: "interview_complete", // rejected after interview
  rejected: "applied",
};

// Map actual DB statuses to stepper step keys
const STATUS_TO_STEP: Record<string, string> = {
  applied: "applied",
  screened: "screening_complete",
  screening_complete: "screening_complete",
  interview_sent: "interview_invited",
  interview_invited: "interview_invited",
  interviewed: "interview_complete",
  interview_complete: "interview_complete",
  shortlisted: "decision_pending",
  decision_pending: "decision_pending",
  hired: "outcome",
  outcome: "outcome",
};

export function StatusTracker({ currentStatus }: StatusTrackerProps) {
  const isRejected = REJECTED_STATUSES.has(currentStatus);

  // For rejected statuses show progress up to where they got, then a red banner
  const stepKey = isRejected
    ? REJECTION_STEP[currentStatus]
    : (STATUS_TO_STEP[currentStatus] ?? currentStatus);
  const currentIndex = STEPS.findIndex((s) => s.key === stepKey);

  const rejectionLabel =
    currentStatus === "interview_rejected"
      ? "Not advancing after interview"
      : "Application not selected";

  return (
    <div className="w-full space-y-3">
      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-start">
        {STEPS.map((step, i) => {
          const isCompleted = i <= currentIndex;
          const isDimmed = i > currentIndex;

          return (
            <div key={step.key} className="flex flex-1 items-start">
              <div className="flex flex-col items-center flex-1">
                <div className="relative flex items-center justify-center">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                      isCompleted && !isRejected &&
                        "border-emerald-500 bg-emerald-500 text-white",
                      isCompleted && isRejected &&
                        "border-emerald-500 bg-emerald-500 text-white",
                      isDimmed &&
                        "border-muted-foreground/30 text-muted-foreground/50"
                    )}
                  >
                    {isCompleted ? <CheckIcon /> : (
                      <span className="h-2 w-2 rounded-full" />
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "mt-2 text-center text-[0.7rem] leading-tight",
                    isCompleted && "text-emerald-600 font-medium dark:text-emerald-400",
                    isDimmed && "text-muted-foreground/60"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex items-center h-7 flex-shrink-0 -mx-1">
                  <div
                    className={cn(
                      "h-0.5 w-6 lg:w-10",
                      i < currentIndex ? "bg-emerald-500" : "bg-muted-foreground/20"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical */}
      <div className="flex flex-col gap-0 sm:hidden">
        {STEPS.map((step, i) => {
          const isCompleted = i <= currentIndex;
          const isDimmed = i > currentIndex;

          return (
            <div key={step.key} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs",
                    isCompleted && "border-emerald-500 bg-emerald-500 text-white",
                    isDimmed && "border-muted-foreground/30"
                  )}
                >
                  {isCompleted && <CheckIcon />}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 flex-1 min-h-4",
                      i < currentIndex ? "bg-emerald-500" : "bg-muted-foreground/20"
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "pb-4 text-sm leading-6",
                  isCompleted && "text-emerald-600 font-medium dark:text-emerald-400",
                  isDimmed && "text-muted-foreground/60"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Rejection banner — shown below the stepper */}
      {isRejected && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-3 py-2">
          <XCircleIcon />
          <span className="text-xs font-medium text-red-700 dark:text-red-400">
            {rejectionLabel}
          </span>
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400">
      <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm2.78-4.22a.75.75 0 0 1-1.06 0L8 9.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L6.94 8 5.22 6.28a.75.75 0 0 1 1.06-1.06L8 6.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L9.06 8l1.72 1.72a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
    </svg>
  );
}
