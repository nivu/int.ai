"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  RemoteTrackPublication,
  RemoteTrack,
} from "livekit-client";
import { cn } from "@/lib/utils";

interface InterviewRoomProps {
  token: string;
  serverUrl: string;
  sessionId: string;
  maxQuestions: number;
  onSessionEnd: () => void;
}

type RoomStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

const RECONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function InterviewRoom({
  token,
  serverUrl,
  sessionId,
  maxQuestions,
  onSessionEnd,
}: InterviewRoomProps) {
  const roomRef = useRef<Room | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [elapsed, setElapsed] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  // Elapsed time counter
  useEffect(() => {
    if (status !== "connected" && status !== "reconnecting") return;
    const interval = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Handle incoming data messages (question progress updates)
  const handleDataReceived = useCallback(
    (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "question_progress" && typeof msg.current === "number") {
          setCurrentQuestion(msg.current);
        }
        if (msg.type === "session_end") {
          setSessionEnded(true);
          onSessionEnd();
        }
      } catch {
        // Ignore non-JSON data messages
      }
    },
    [onSessionEnd]
  );

  // Connect to LiveKit room
  useEffect(() => {
    if (sessionEnded) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    // Connection state changes
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      switch (state) {
        case ConnectionState.Connected:
          setStatus("connected");
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          break;
        case ConnectionState.Reconnecting:
          setStatus("reconnecting");
          reconnectTimerRef.current = setTimeout(() => {
            room.disconnect();
            setStatus("disconnected");
          }, RECONNECT_TIMEOUT_MS);
          break;
        case ConnectionState.Disconnected:
          setStatus("disconnected");
          break;
      }
    });

    // Track AI audio activity
    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication) => {
        if (track.kind === Track.Kind.Audio) {
          // Attach audio element so we can hear the AI
          const el = track.attach();
          el.id = `ai-audio-${publication.trackSid}`;
          document.body.appendChild(el);
        }
      }
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication) => {
        track.detach();
        const el = document.getElementById(`ai-audio-${publication.trackSid}`);
        el?.remove();
      }
    );

    // AI speaking indicator based on active speaker changes
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const localId = room.localParticipant?.identity;
      let aiActive = false;
      let localActive = false;
      for (const speaker of speakers) {
        if (speaker.identity === localId) {
          localActive = true;
        } else {
          aiActive = true;
        }
      }
      setAiSpeaking(aiActive);
      setLocalSpeaking(localActive);
    });

    // Data messages from the AI agent
    room.on(RoomEvent.DataReceived, handleDataReceived);

    // Session end via room disconnect by server
    room.on(RoomEvent.Disconnected, () => {
      if (!sessionEnded) {
        setSessionEnded(true);
        onSessionEnd();
      }
    });

    room
      .connect(serverUrl, token)
      .then(async () => {
        // Publish local microphone
        await room.localParticipant.setMicrophoneEnabled(true);
        setStatus("connected");
      })
      .catch(() => {
        setStatus("disconnected");
      });

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, token, sessionId]);

  // Session ended state
  if (sessionEnded) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
          >
            <path
              fillRule="evenodd"
              d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
              clipRule="evenodd"
            />
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
              status === "connected" && "bg-emerald-500",
              status === "reconnecting" && "bg-amber-500 animate-pulse",
              status === "connecting" && "bg-blue-500 animate-pulse",
              status === "disconnected" && "bg-red-500"
            )}
          />
          <span className="capitalize">{status}</span>
        </div>
        <span className="tabular-nums">{formatTime(elapsed)}</span>
      </div>

      {/* Reconnecting overlay */}
      {status === "reconnecting" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Attempting to reconnect... Please check your internet connection.
        </div>
      )}

      {status === "disconnected" && !sessionEnded && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Connection lost. The interview session has ended.
        </div>
      )}

      {/* AI speaking indicator */}
      <div className="flex flex-col items-center gap-4">
        <div
          className={cn(
            "relative flex h-28 w-28 items-center justify-center rounded-full transition-all duration-300",
            aiSpeaking
              ? "bg-primary/10 ring-4 ring-primary/20"
              : "bg-muted/50 ring-2 ring-muted-foreground/10"
          )}
        >
          {/* Animated pulse rings when AI is speaking */}
          {aiSpeaking && (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
              <span className="absolute inset-[-8px] animate-pulse rounded-full border-2 border-primary/20" />
            </>
          )}
          {/* Microphone / speaker icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={cn(
              "h-10 w-10 transition-colors",
              aiSpeaking
                ? "text-primary"
                : "text-muted-foreground/50"
            )}
          >
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
            <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {aiSpeaking ? "AI Interviewer is speaking..." : "AI Interviewer"}
        </p>
      </div>

      {/* Candidate speaking indicator */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-3 w-3 rounded-full transition-colors",
            localSpeaking ? "bg-emerald-500" : "bg-muted-foreground/20"
          )}
        />
        <span className="text-xs text-muted-foreground">
          {localSpeaking ? "You are speaking" : "Your microphone"}
        </span>
      </div>

      {/* Question progress */}
      <div className="text-sm text-muted-foreground">
        Question {currentQuestion} of {maxQuestions}
      </div>

      {/* End interview button */}
      {status === "connected" && (
        <button
          type="button"
          className="mt-4 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          onClick={() => {
            roomRef.current?.disconnect();
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
