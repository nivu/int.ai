"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InterviewRoom } from "@/components/candidate/interview-room";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  useEffect(() => {
    // Only read sessionStorage once — use a ref to prevent strict mode double-read
    if (roomData) return;

    const raw = sessionStorage.getItem("interview_room");
    if (!raw) {
      router.replace("/interview");
      return;
    }

    try {
      const data: RoomData = JSON.parse(raw);
      if (!data.token || !data.serverUrl || !data.sessionId) {
        throw new Error("Incomplete room data");
      }
      setRoomData(data);
    } catch {
      router.replace("/interview");
    }
  }, [router, roomData]);

  const livekitUrl =
    roomData?.serverUrl ||
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    "";

  if (completed) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
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
            <CardTitle className="text-xl">
              Thank you for completing your interview!
            </CardTitle>
            <CardDescription className="text-base">
              We&apos;ll review your responses and follow up soon. You can close
              this page or return to your portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => router.push("/portal")}>
              Return to Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!roomData) {
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
        onSessionEnd={() => setCompleted(true)}
      />
    </div>
  );
}
