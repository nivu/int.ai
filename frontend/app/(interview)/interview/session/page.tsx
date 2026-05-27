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
  const [isInviteTokenUser, setIsInviteTokenUser] = useState(false);

  const sessionActiveRef = useRef(false);

  useEffect(() => {
    const cleanupFns: Array<() => void> = [];

    async function validateAndInit() {
      const raw = sessionStorage.getItem("interview_room");
      if (!raw) {
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

      const inviteToken = sessionStorage.getItem("invite_token");
      if (inviteToken) setIsInviteTokenUser(true);

      // Re-check session status — 403 means completed/terminated, never show room
      try {
        const supabase = createClient();
        const { data: { session: authSession } } = await supabase.auth.getSession();

        const fetchOptions: RequestInit & { token?: string } = inviteToken
          ? { headers: { "X-Invite-Token": inviteToken } }
          : { token: authSession?.access_token ?? undefined };

        await backendFetch("/api/v1/interview/my-session", fetchOptions);
      } catch (err: unknown) {
        if ((err as { status?: number })?.status === 403) {
          sessionStorage.removeItem("interview_room");
          router.replace("/portal?session_ended=1");
          return;
        }
        // Non-403 errors — let the LiveKit room handle it
      }

      setRoomData(data);
      setChecking(false);

      window.history.pushState({ interviewActive: true }, "");

      const handlePopState = () => {
        if (!sessionActiveRef.current) return;
        window.history.pushState({ interviewActive: true }, "");
        sendAbandonBeacon(data.sessionId);
        sessionStorage.removeItem("interview_room");
        router.replace("/portal?session_ended=1");
      };
      window.addEventListener("popstate", handlePopState);
      cleanupFns.push(() => window.removeEventListener("popstate", handlePopState));

      const handleBeforeUnload = () => {
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

  useEffect(() => {
    if (roomData) sessionActiveRef.current = true;
  }, [roomData]);

  useEffect(() => {
    if (completed) {
      sessionActiveRef.current = false;
      // Invite-token users can't access /portal without a Supabase session —
      // stay on page so they see the "Interview Complete" message from the room component.
      if (!isInviteTokenUser) {
        router.replace("/portal");
      }
    }
  }, [completed, isInviteTokenUser, router]);

  const livekitUrl =
    roomData?.serverUrl ||
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    "";

  // Invite-token users: after completion, show a thank-you screen instead of
  // spinning while waiting for a /portal redirect that requires Supabase auth.
  if (completed && isInviteTokenUser) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
          <svg
            className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Interview Complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your responses have been recorded. You can now close this tab.
        </p>
      </div>
    );
  }

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
  navigator.sendBeacon(
    "/api/proxy/api/v1/interview/terminate-abandoned",
    new Blob([JSON.stringify({ session_id: sessionId })], { type: "application/json" })
  );
}
