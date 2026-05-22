import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

async function validateToken(token: string): Promise<{ signin_url: string } | { error: string; status: number }> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/v1/interview/magic-auth?token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: data?.detail ?? "Invalid link.", status: res.status };
    }
    return { signin_url: data.signin_url };
  } catch {
    return { error: "Could not reach the server. Please try again.", status: 503 };
  }
}

export default async function InterviewStartPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return <ErrorScreen message="No token found in this link. Please use the link from your invitation email." />;
  }

  const result = await validateToken(token);

  if ("error" in result) {
    const hint =
      result.status === 410
        ? result.error
        : "This link is invalid. Please use the link from your invitation email.";
    return <ErrorScreen message={hint} />;
  }

  // Redirect to Supabase sign-in URL — Supabase will authenticate the candidate
  // and redirect them to /auth/callback?next=/interview
  redirect(result.signin_url);
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-xl border bg-card p-8 text-center space-y-4 shadow-sm">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-6 w-6 text-red-600 dark:text-red-400"
            >
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </div>
        </div>
        <h1 className="text-xl font-semibold">Unable to open interview</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        <p className="text-xs text-muted-foreground">
          If you believe this is a mistake, please contact the hiring team.
        </p>
      </div>
    </div>
  );
}
