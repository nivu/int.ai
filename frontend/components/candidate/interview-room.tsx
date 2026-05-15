"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  useRoomContext,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState, RoomEvent } from "livekit-client";
import { cn } from "@/lib/utils";

interface InterviewRoomProps {
  token: string;
  serverUrl: string;
  sessionId: string;
  maxQuestions: number;
  onSessionEnd: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Inner component (must be inside LiveKitRoom context)
// ---------------------------------------------------------------------------

function InterviewRoomInner({
  maxQuestions,
  onSessionEnd,
}: {
  maxQuestions: number;
  onSessionEnd: () => void;
}) {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();

  const [elapsed, setElapsed] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [tabViolation, setTabViolation] = useState(false);
  const [interviewActive, setInterviewActive] = useState(false);
  const [noResponseSecondsLeft, setNoResponseSecondsLeft] = useState<number | null>(null);
  const [graceActive, setGraceActive] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [interviewClosing, setInterviewClosing] = useState(false);

  const connected = connectionState === ConnectionState.Connected;

  // Refs to avoid stale closures
  const sessionEndedRef = useRef(false);
  const interviewActiveRef = useRef(false);
  const userSpeakingRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // True from question_progress until agent_speaking/timer_started — suppresses
  // the fallback timer so it never starts while the agent is about to speak.
  const awaitingAgentSpeechRef = useRef(false);
  const NO_RESPONSE_TIMEOUT = 15;

  useEffect(() => { sessionEndedRef.current = sessionEnded; }, [sessionEnded]);
  useEffect(() => { interviewActiveRef.current = interviewActive; }, [interviewActive]);
  useEffect(() => { userSpeakingRef.current = userSpeaking; }, [userSpeaking]);

  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Countdown helpers
  // ------------------------------------------------------------------
  const freezeCountdown = useCallback(() => {
    // Stop the countdown interval but preserve the current value (frozen state)
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    // Do NOT set noResponseSecondsLeft to null — keep the frozen value visible
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setNoResponseSecondsLeft(null);
  }, []);

  const endSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    clearCountdown();
    sessionStorage.removeItem("interview_room");
    setSessionEnded(true);
    onSessionEnd();
  }, [clearCountdown, onSessionEnd]);

  const startCountdown = useCallback((from: number = NO_RESPONSE_TIMEOUT) => {
    console.log("[interview] startCountdown from=", from, "interviewActive=", interviewActiveRef.current);
    clearCountdown();
    let remaining = from;
    setNoResponseSecondsLeft(remaining);
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setNoResponseSecondsLeft(remaining);
      if (remaining <= 0) {
        // Timer hit zero — just clear the UI. The backend handles the skip
        // and will send a question_progress message to advance to the next
        // question. We never terminate the interview from the frontend on timeout.
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        setNoResponseSecondsLeft(null);
      }
    }, 1000);
  }, [clearCountdown]);

  useEffect(() => () => clearCountdown(), [clearCountdown]);

  // Timer control — driven by backend data channel events (timer_started /
  // timer_resumed).  This fallback only fires when the backend event is
  // delayed; the awaitingAgentSpeechRef guard prevents it from firing during
  // the window between question_progress (agent still "listening") and the
  // agent actually starting to speak — which was the cause of the premature
  // 15-second countdown that ran while the AI was still generating its reply.
  useEffect(() => {
    if (
      state === "listening" &&
      interviewActive &&
      !sessionEnded &&
      !countdownRef.current &&
      !graceActive &&
      !userSpeaking &&
      !awaitingAgentSpeechRef.current
    ) {
      console.log("[interview] Fallback: starting countdown on agent listening state");
      startCountdown(NO_RESPONSE_TIMEOUT);
    }
  }, [state, interviewActive, sessionEnded, graceActive, userSpeaking, startCountdown]);

  // ------------------------------------------------------------------
  // Elapsed time counter
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [connected]);

  // Enable microphone on connect AND after each state change to ensure
  // the audio stream is always active and ready to capture voice
  useEffect(() => {
    if (connected && localParticipant) {
      localParticipant.setMicrophoneEnabled(true);
    }
  }, [connected, localParticipant]);

  // Also explicitly enable when state changes (speaking → listening)
  useEffect(() => {
    if (state === "listening" && localParticipant && connected) {
      // Add a small delay to ensure state transition is complete
      setTimeout(() => {
        localParticipant.setMicrophoneEnabled(true);
      }, 50);
    }
  }, [state, localParticipant, connected]);

  // ------------------------------------------------------------------
  // Tab-switch detection
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Only enforce tab-switch after the interview has actually started (first
      // question begun).  During the greeting / rules phase interviewActive is
      // still false, so switching away there does not terminate the session.
      console.log("[interview] Visibility changed - hidden:", document.hidden, "connected:", connected, "interviewActive:", interviewActiveRef.current, "sessionEnded:", sessionEndedRef.current, "tabViolation:", tabViolation);
      
      if (
        document.hidden &&
        connected &&
        interviewActiveRef.current &&
        !sessionEndedRef.current &&
        !tabViolation
      ) {
        console.log("[interview] Tab switch detected - terminating session");
        setTabViolation(true);
        // Clear sessionStorage immediately so any refresh from the violation
        // screen cannot re-enter the interview room.
        sessionStorage.removeItem("interview_room");
        
        const message = JSON.stringify({ type: "tab_switch" });
        console.log("[interview] Sending tab_switch message:", message);
        
        localParticipant?.publishData(
          new TextEncoder().encode(message),
          { reliable: true }
        ).then(() => {
          console.log("[interview] Tab switch message sent successfully");
          setTimeout(() => {
            console.log("[interview] Disconnecting room after tab switch");
            room.disconnect();
          }, 1500);
        }).catch((error) => {
          console.error("[interview] Failed to send tab switch message:", error);
          // Still disconnect even if message fails
          setTimeout(() => room.disconnect(), 1500);
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [connected, tabViolation, localParticipant, room, interviewActive]);

  // ------------------------------------------------------------------
  // Data messages from the agent
  // ------------------------------------------------------------------
  // Keep a ref so the room event handler always calls the latest version of
  // each function without needing to re-subscribe when deps change.
  const clearCountdownRef = useRef(clearCountdown);
  const freezeCountdownRef = useRef(freezeCountdown);
  const startCountdownRef = useRef(startCountdown);
  const endSessionRef = useRef(endSession);
  useEffect(() => { clearCountdownRef.current = clearCountdown; }, [clearCountdown]);
  useEffect(() => { freezeCountdownRef.current = freezeCountdown; }, [freezeCountdown]);
  useEffect(() => { startCountdownRef.current = startCountdown; }, [startCountdown]);
  useEffect(() => { endSessionRef.current = endSession; }, [endSession]);

  useEffect(() => {
    const handler = (payload: Uint8Array) => {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(payload));
        console.log("[interview] data received:", parsed);
        if (parsed.type === "question_progress" && typeof parsed.current === "number") {
          // Mark that we're waiting for the agent to start speaking the next
          // question. This suppresses the fallback timer until agent_speaking
          // or timer_started arrives, preventing a premature 15s countdown
          // while the agent is still generating its reply.
          awaitingAgentSpeechRef.current = true;
          setCurrentQuestion(parsed.current);
          setInterviewActive(true);
          interviewActiveRef.current = true;
          clearCountdownRef.current();
          setGraceActive(false);
          setUserSpeaking(false);
          userSpeakingRef.current = false;
        }
        if (parsed.type === "timer_started" && !sessionEndedRef.current) {
          console.log("[interview] timer_started remaining=", parsed.remaining, "interviewActive=", interviewActiveRef.current);
          awaitingAgentSpeechRef.current = false;
          setInterviewActive(true);
          interviewActiveRef.current = true;
          setGraceActive(false);
          startCountdownRef.current(
            typeof parsed.remaining === "number" ? parsed.remaining : NO_RESPONSE_TIMEOUT
          );
        }
        if (parsed.type === "agent_speaking") {
          console.log("[interview] agent_speaking — clearing countdown (agent is speaking)");
          awaitingAgentSpeechRef.current = false;
          clearCountdownRef.current();
          setGraceActive(false);
          setUserSpeaking(false);
          userSpeakingRef.current = false;
        }
        if (parsed.type === "user_speaking") {
          console.log("[interview] user_speaking — freezing countdown at", parsed.remaining);
          freezeCountdownRef.current();
          // Update the frozen timer value if provided by backend
          if (typeof parsed.remaining === "number") {
            setNoResponseSecondsLeft(parsed.remaining);
          }
          setGraceActive(false);
          setUserSpeaking(true);
          userSpeakingRef.current = true;
        }
        if (parsed.type === "grace_period_started") {
          console.log("[interview] grace_period_started duration=", parsed.duration, "remaining=", parsed.remaining);
          setGraceActive(true);
          setUserSpeaking(false);
          userSpeakingRef.current = false;
          clearCountdownRef.current();
        }
        if (parsed.type === "timer_resumed") {
          console.log("[interview] timer_resumed remaining=", parsed.remaining);
          setGraceActive(false);
          setUserSpeaking(false);
          userSpeakingRef.current = false;
          if (interviewActiveRef.current && !sessionEndedRef.current) {
            startCountdownRef.current(
              typeof parsed.remaining === "number" ? parsed.remaining : NO_RESPONSE_TIMEOUT
            );
          }
        }
        // Legacy support for old event name
        if (parsed.type === "user_speaking_stopped") {
          console.log("[interview] user_speaking_stopped (legacy) remaining=", parsed.remaining);
          setGraceActive(false);
          if (interviewActiveRef.current && !sessionEndedRef.current) {
            startCountdownRef.current(
              typeof parsed.remaining === "number" ? parsed.remaining : NO_RESPONSE_TIMEOUT
            );
          }
        }
        if (parsed.type === "session_end" || parsed.type === "terminated") {
          endSessionRef.current();
        }
        if (parsed.type === "interview_closing") {
          console.log("[interview] interview_closing — clearing timer, wrapping up");
          clearCountdownRef.current();
          setGraceActive(false);
          setUserSpeaking(false);
          userSpeakingRef.current = false;
          setInterviewClosing(true);
        }
      } catch {
        // ignore non-JSON
      }
    };

    console.log("[interview] registering DataReceived handler on room", room);
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room]);

  // ------------------------------------------------------------------
  // Room disconnect handler
  // ------------------------------------------------------------------
  useEffect(() => {
    let connectedAt: number | null = null;
    const handleConnect = () => { connectedAt = Date.now(); };
    const handleDisconnect = () => {
      if (
        connectedAt &&
        Date.now() - connectedAt > 5000 &&
        !sessionEndedRef.current &&
        !tabViolation
      ) {
        endSession();
      }
    };
    room.on("connected", handleConnect);
    room.on("disconnected", handleDisconnect);
    return () => {
      room.off("connected", handleConnect);
      room.off("disconnected", handleDisconnect);
    };
  }, [room, tabViolation, endSession]);

  // Render raw SDK voice-assistant state to avoid UI deadlocks where the
  // derived "trulyListening" heuristic gets stuck and keeps showing speaking.
  const displayState = state;

  // ------------------------------------------------------------------
  // Render states
  // ------------------------------------------------------------------
  if (sessionEnded) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-emerald-600 dark:text-emerald-400">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Interview Complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your responses have been recorded.</p>
      </div>
    );
  }

  if (tabViolation) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-red-600 dark:text-red-400">
            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Tab Switch Detected</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          You switched tabs during the interview. This session has been terminated and recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {/* Connection status bar */}
      <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              connectionState === ConnectionState.Connected && "bg-emerald-500",
              connectionState === ConnectionState.Reconnecting && "bg-amber-500 animate-pulse",
              connectionState === ConnectionState.Connecting && "bg-blue-500 animate-pulse",
              connectionState === ConnectionState.Disconnected && "bg-red-500"
            )}
          />
          <span className="capitalize">
            {connectionState === ConnectionState.Connected
              ? "connected"
              : connectionState.toLowerCase()}
          </span>
        </div>
        <span className="tabular-nums">{formatTime(elapsed)}</span>
      </div>

      {/* Reconnecting / disconnected banners */}
      {connectionState === ConnectionState.Reconnecting && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Attempting to reconnect... Please check your internet connection.
        </div>
      )}
      {connectionState === ConnectionState.Disconnected && !sessionEnded && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Connection lost. The interview session has ended.
        </div>
      )}

      {/* AI Agent Visualizer */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-48 w-48">
          <BarVisualizer
            state={displayState as Parameters<typeof BarVisualizer>[0]["state"]}
            trackRef={audioTrack}
            barCount={7}
            className="h-full w-full rounded-full"
            style={{
              "--lk-fg": "#7c3aed",
              "--lk-va-bg": "rgba(124, 58, 237, 0.15)",
            } as React.CSSProperties}
          />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {displayState === "speaking"
            ? "AI Interviewer is speaking..."
            : displayState === "thinking"
              ? "Thinking..."
              : displayState === "listening"
                ? "Listening..."
                : "AI Interviewer"}
        </p>
      </div>

      {/* Question progress */}
      <div className="text-sm text-muted-foreground">
        Question {currentQuestion} of {maxQuestions}
      </div>

      {/* No-response countdown ring — hidden during closing */}
      {interviewActive && noResponseSecondsLeft !== null && !graceActive && !interviewClosing && (() => {
        const radius = 40;
        const stroke = 5;
        const size = (radius + stroke) * 2;
        const circumference = 2 * Math.PI * radius;
        const progress = Math.max(0, noResponseSecondsLeft) / NO_RESPONSE_TIMEOUT;
        const dashoffset = circumference * (1 - progress);
        const isUrgent = noResponseSecondsLeft <= 5;
        const isWarning = noResponseSecondsLeft <= 10;
        const ringColor = isUrgent ? "#ef4444" : isWarning ? "#f59e0b" : "#22c55e";
        const isFrozen = userSpeaking; // Timer is frozen when user is speaking
        return (
          <div className="flex flex-col items-center gap-1">
            <div className={cn("relative", isUrgent && !isFrozen && "animate-pulse")}>
              <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                {/* background track */}
                <circle
                  cx={size / 2} cy={size / 2} r={radius}
                  fill="none" stroke="currentColor"
                  strokeWidth={stroke}
                  className="text-muted-foreground/20"
                />
                {/* countdown arc */}
                <circle
                  cx={size / 2} cy={size / 2} r={radius}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashoffset}
                  style={{ transition: isFrozen ? "none" : "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
                />
              </svg>
              {/* number in centre */}
              <span
                className="absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums"
                style={{ color: ringColor }}
              >
                {noResponseSecondsLeft}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isFrozen ? "timer paused" : "seconds to respond"}
            </p>
          </div>
        );
      })()}

      {/* Wrapping up banner — shown when last question is done */}
      {interviewClosing && (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-emerald-600 dark:text-emerald-400">
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Wrapping up your interview...</p>
        </div>
      )}

      {/* Live rules reminder */}
      <div className="w-full rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
        <p className="font-semibold">Reminders</p>
        <p>After each question, the timer counts down only when you are <span className="font-medium">not speaking</span>. If <span className="font-medium">15 seconds</span> of silence passes, the interviewer will move on.</p>
        <p>Do <span className="font-medium">not switch tabs</span> — tab switching will immediately terminate your session.</p>
      </div>

      {/* End interview button */}
      {connected && (
        <button
          type="button"
          className="mt-4 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          onClick={endSession}
        >
          End Interview
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outer wrapper with LiveKitRoom provider
// ---------------------------------------------------------------------------

export function InterviewRoom({
  token,
  serverUrl,
  sessionId,
  maxQuestions,
  onSessionEnd,
}: InterviewRoomProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={false}
      data-session-id={sessionId}
    >
      <RoomAudioRenderer />
      <InterviewRoomInner maxQuestions={maxQuestions} onSessionEnd={onSessionEnd} />
    </LiveKitRoom>
  );
}
