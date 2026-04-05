import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      {/* Nav */}
      <header className="border-b border-zinc-100 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight">int.ai</span>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign In
            </Link>
            <Link
              href="/auth/login"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            AI-Powered Hiring Automation
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
            Hire smarter,{" "}
            <span className="text-zinc-400 dark:text-zinc-500">not harder</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Automate resume screening with AI-powered scoring and conduct
            first-round voice interviews with an intelligent AI agent — so your
            team can focus on the candidates who matter most.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/auth/login"
              className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Start Hiring
            </Link>
            <Link
              href="/portal"
              className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Candidate Portal
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mx-auto mt-24 grid max-w-5xl gap-8 px-6 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-100 p-6 dark:border-zinc-800">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-blue-600 dark:text-blue-400">
                <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625ZM7.5 15a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 7.5 15Zm.75 2.25a.75.75 0 0 0 0 1.5H12a.75.75 0 0 0 0-1.5H8.25Z" clipRule="evenodd" />
                <path d="M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">AI Resume Screening</h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              4-layer scoring — embeddings, skill match, experience alignment,
              and culture fit — powered by GPT-4o mini.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-100 p-6 dark:border-zinc-800">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-emerald-600 dark:text-emerald-400">
                <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Voice AI Interviews</h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Natural voice conversations with an AI interviewer. Adaptive
              follow-ups, real-time transcription, and automatic evaluation.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-100 p-6 dark:border-zinc-800">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-purple-600 dark:text-purple-400">
                <path fillRule="evenodd" d="M2.25 13.5a8.25 8.25 0 0 1 8.25-8.25.75.75 0 0 1 .75.75v6.75H18a.75.75 0 0 1 .75.75 8.25 8.25 0 0 1-16.5 0Z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M12.75 3a.75.75 0 0 1 .75-.75 8.25 8.25 0 0 1 8.25 8.25.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75V3Z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Smart Analytics</h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Side-by-side candidate comparison with radar charts, hiring funnel
              analytics, and AI-generated interview reports.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-100 py-8 text-center text-sm text-zinc-400 dark:border-zinc-800">
        Built by Nunnari Labs
      </footer>
    </div>
  );
}
