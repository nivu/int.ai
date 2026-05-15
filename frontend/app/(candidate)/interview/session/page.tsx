"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InterviewRoom } from "@/components/candidate/interview-room";
import { backendFetch } from "@/lib/api/backend";
import { createClient } from "@/lib/supabase/client";

interface RoomData {
  token: string;
  serverUrl: string;
  sessionId: string;
  maxQuestions: number;
  jobTitle: string;
}

export default function InterviewSessionPage() {
  const router = useRouter();
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [completed, setCompleted] = useState(false);
  const [checking, setChecking] = useState(true);

  // True once the room is rendered and the interview is in progress.
  // Only while this is true do we fire the beacon and guard history.
  const sessionActiveRef = useRef(false);

  useEffect(() => {
    const cleanupFns: Array<() => void> = [];

    async function validateAndInit() {
      const raw = sessionStorage.getItem("interview_room");
      if (!raw) {
        // No session data — either never started or already completed/terminated.
        // Send to portal, not back to /interview, so they can't restart.
        router.replace("/portal");
        return;
      }

      let data: RoomData;
      try {
        data = JSON.parse(raw);
        if (!data.token || !data.serverUrl || !data.sessionId) throw new Error();
      } catch {
        sessionStorage.removeItem("interview_room");
        router.replace("/portal");
        return;
      }

      // ── Server-side session status check ────────────────────────────────
      // Re-use my-session to verify the session is still enterable.  A 403
      // means completed / terminated → send to portal, never show interview UI.
      try {
        const supabase = createClient();
        const { data: { session: authSession } } = await supabase.auth.getSession();
        await backendFetch("/api/v1/interview/my-session", {
          token: authSession?.access_token ?? undefined,
        });
      } catch (err: unknown) {
        if ((err as { status?: number })?.status === 403) {
          sessionStorage.removeItem("interview_room");
          router.replace("/portal?session_ended=1");
          return;
        }
        // Non-403 errors (network, etc.) — let the LiveKit room handle it.
      }

      setRoomData(data);
      setChecking(false);

      // ── History API: intercept back button while session is active ───────
      window.history.pushState({ interviewActive: true }, "");

      const handlePopState = () => {
        if (!sessionActiveRef.current) return;
        // Re-push so the URL stays on this page while we redirect
        window.history.pushState({ interviewActive: true }, "");
        sendAbandonBeacon(data.sessionId);
        sessionStorage.removeItem("interview_room");
        router.replace("/portal?session_ended=1");
      };
      window.addEventListener("popstate", handlePopState);
      cleanupFns.push(() => window.removeEventListener("popstate", handlePopState));

      // ── beforeunload: beacon on page refresh / tab close ────────────────
      // ALSO clear sessionStorage synchronously so that if the user refreshes,
      // the session page finds no data and redirects to /interview instead of
      // re-entering the interview room.
      const handleBeforeUnload = () => {
        // Always clear storage on any unload — this is the key guard.
        // Even if the session is already ended (tab violation screen, completed
        // screen), clearing here ensures a refresh never re-enters the room.
        sessionStorage.removeItem("interview_room");
        if (sessionActiveRef.current) {
          sendAbandonBeacon(data.sessionId);
        }
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      cleanupFns.push(() => window.removeEventListener("beforeunload", handleBeforeUnload));
    }

    validateAndInit();
    return () => cleanupFns.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark session active once room data is available AND clear storage
  // immediately on any terminal event so a refresh can never re-enter.
  useEffect(() => {
    if (roomData) sessionActiveRef.current = true;
  }, [roomData]);

  // Redirect to portal on session end; clear active flag first.
  // No ?session_ended param — the interview completed normally.
  useEffect(() => {
    if (completed) {
      sessionActiveRef.current = false;
      router.replace("/portal");
    }
  }, [completed, router]);

  const livekitUrl =
    roomData?.serverUrl ||
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    "";

  if (checking || !roomData || completed) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <InterviewRoom
        token={roomData.token}
        serverUrl={livekitUrl}
        sessionId={roomData.sessionId}
        maxQuestions={roomData.maxQuestions}
        onSessionEnd={() => {
          sessionActiveRef.current = false;
          setCompleted(true);
        }}
      />
    </div>
  );
}

function sendAbandonBeacon(sessionId: string) {
  // Route through the Next.js proxy so the browser never hits the backend directly.
  // Use a Blob with application/json so FastAPI parses the body correctly —
  // sendBeacon sends text/plain by default which causes a 422.
  navigator.sendBeacon(
    "/api/proxy/api/v1/interview/terminate-abandoned",
    new Blob([JSON.stringify({ session_id: sessionId })], { type: "application/json" })
  );
}
