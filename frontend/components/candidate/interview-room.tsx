"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  useRoomContext,
  useDataChannel,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState } from "livekit-client";
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

  const connected = connectionState === ConnectionState.Connected;

  // Elapsed time counter
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [connected]);

  // Enable microphone on connect
  useEffect(() => {
    if (connected && localParticipant) {
      localParticipant.setMicrophoneEnabled(true);
    }
  }, [connected, localParticipant]);

  // Handle data messages from the agent
  const onDataReceived = useCallback(
    (msg: { payload: Uint8Array }) => {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(msg.payload));
        if (parsed.type === "question_progress" && typeof parsed.current === "number") {
          setCurrentQuestion(parsed.current);
        }
        if (parsed.type === "session_end") {
          setSessionEnded(true);
          onSessionEnd();
        }
      } catch {
        // Ignore non-JSON
      }
    },
    [onSessionEnd]
  );

  useDataChannel("", onDataReceived);

  // Handle room disconnect — only after we've been connected for at least 5 seconds
  // to avoid false triggers from brief connection hiccups
  useEffect(() => {
    let connectedAt: number | null = null;

    const handleConnect = () => {
      connectedAt = Date.now();
    };
    const handleDisconnect = () => {
      // Only trigger end if we were connected for at least 5 seconds
      if (connectedAt && Date.now() - connectedAt > 5000 && !sessionEnded) {
        setSessionEnded(true);
        onSessionEnd();
      }
    };
    room.on("connected", handleConnect);
    room.on("disconnected", handleDisconnect);
    return () => {
      room.off("connected", handleConnect);
      room.off("disconnected", handleDisconnect);
    };
  }, [room, sessionEnded, onSessionEnd]);

  if (sessionEnded) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-emerald-600 dark:text-emerald-400">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Interview Complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your responses have been recorded.
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
            {connectionState === ConnectionState.Connected ? "connected" : connectionState.toLowerCase()}
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
            state={state}
            track={audioTrack}
            barCount={7}
            className="h-full w-full rounded-full"
            style={{
              "--lk-fg": "#7c3aed",
              "--lk-va-bg": "rgba(124, 58, 237, 0.15)",
            } as React.CSSProperties}
          />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {state === "speaking"
            ? "AI Interviewer is speaking..."
            : state === "thinking"
              ? "Thinking..."
              : state === "listening"
                ? "Listening..."
                : "AI Interviewer"}
        </p>
      </div>

      {/* Question progress */}
      <div className="text-sm text-muted-foreground">
        Question {currentQuestion} of {maxQuestions}
      </div>

      {/* End interview button */}
      {connected && (
        <button
          type="button"
          className="mt-4 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          onClick={() => {
            room.disconnect();
            setSessionEnded(true);
            onSessionEnd();
          }}
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
