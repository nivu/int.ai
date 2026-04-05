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

export type ApplicationStatus = (typeof STEPS)[number]["key"];

interface StatusTrackerProps {
  currentStatus: string;
}

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
  rejected: "outcome",
  hired: "outcome",
  outcome: "outcome",
};

export function StatusTracker({ currentStatus }: StatusTrackerProps) {
  const mappedStep = STATUS_TO_STEP[currentStatus] ?? currentStatus;
  const currentIndex = STEPS.findIndex((s) => s.key === mappedStep);

  return (
    <div className="w-full">
      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-start">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;

          return (
            <div key={step.key} className="flex flex-1 items-start">
              <div className="flex flex-col items-center flex-1">
                {/* Circle */}
                <div className="relative flex items-center justify-center">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                      isCompleted &&
                        "border-emerald-500 bg-emerald-500 text-white",
                      isCurrent &&
                        "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950",
                      !isCompleted &&
                        !isCurrent &&
                        "border-muted-foreground/30 text-muted-foreground/50"
                    )}
                  >
                    {isCompleted ? (
                      <CheckIcon />
                    ) : (
                      <span className="h-2 w-2 rounded-full">
                        {isCurrent && (
                          <span className="absolute inset-0 animate-ping rounded-full border-2 border-blue-400 opacity-40" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
                {/* Label */}
                <span
                  className={cn(
                    "mt-2 text-center text-[0.7rem] leading-tight",
                    isCompleted && "text-emerald-600 font-medium dark:text-emerald-400",
                    isCurrent && "text-blue-600 font-medium dark:text-blue-400",
                    !isCompleted &&
                      !isCurrent &&
                      "text-muted-foreground/60"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="flex items-center h-7 flex-shrink-0 -mx-1">
                  <div
                    className={cn(
                      "h-0.5 w-6 lg:w-10",
                      i < currentIndex
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/20"
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
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;

          return (
            <div key={step.key} className="flex items-stretch gap-3">
              {/* Circle + vertical line */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs",
                    isCompleted &&
                      "border-emerald-500 bg-emerald-500 text-white",
                    isCurrent &&
                      "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950",
                    !isCompleted &&
                      !isCurrent &&
                      "border-muted-foreground/30"
                  )}
                >
                  {isCompleted && <CheckIcon />}
                  {isCurrent && (
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 flex-1 min-h-4",
                      i < currentIndex
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/20"
                    )}
                  />
                )}
              </div>
              {/* Label */}
              <span
                className={cn(
                  "pb-4 text-sm leading-6",
                  isCompleted && "text-emerald-600 font-medium dark:text-emerald-400",
                  isCurrent && "text-blue-600 font-medium dark:text-blue-400",
                  !isCompleted && !isCurrent && "text-muted-foreground/60"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3 w-3"
    >
      <path
        fillRule="evenodd"
        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
