# int.ai Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-05

## Active Technologies

- Python 3.11+ (backend): FastAPI, LiveKit Agents SDK, Deepgram SDK, OpenAI SDK, Celery, sentence-transformers
- TypeScript 5.x (frontend): Next.js 14+ (App Router), @supabase/ssr, shadcn/ui, Recharts, TanStack Table
- Database: Supabase PostgreSQL + pgvector + Supabase Storage + Supabase Auth

## Project Structure

```text
frontend/          # Next.js (TypeScript, App Router)
├── app/
│   ├── (admin)/   # Admin dashboard routes
│   ├── (candidate)/ # Candidate portal routes
│   ├── apply/     # Public application form
│   ├── client/    # Client portal (read-only job access, spec 003)
│   └── auth/
├── components/
│   ├── ui/        # shadcn/ui
│   ├── admin/
│   ├── candidate/
│   └── shared/
└── lib/
    ├── supabase/
    └── api/

backend/           # Python (FastAPI)
├── app/           # Deployed application code only
│   ├── api/       # Route handlers
│   ├── services/  # Business logic
│   ├── interview/ # LiveKit agent
│   ├── models/    # Pydantic models
│   ├── tasks/     # Celery tasks
│   └── worker.py
├── scripts/       # One-off scripts — NOT deployed (see scripts/README.md)
│   ├── ops/       # Worker/server process management
│   ├── data/      # One-off data operations (mutate prod data)
│   └── simulations/ # End-to-end pipeline exercises
├── tests/         # pytest suite
├── start_api.py            # Dockerfile CMD + Procfile web  — must stay at root
├── start_worker_with_cron.py # Procfile worker              — must stay at root
├── run_agent.py            # Procfile agent                 — must stay at root
└── pyproject.toml

docs/              # Living documentation only (see docs/README.md)
├── architecture/
├── guides/
├── operations/
└── archive/       # Point-in-time reports — never current, don't add here

specs/             # spec-kit features — what the system MUST do
├── 001-hiring-automation-platform/
└── 002-multi-org-isolation/

supabase/
└── migrations/
```

## Documentation Rules

Four homes, and the distinction is load-bearing:

| Content | Home |
|---|---|
| Principles and non-negotiables | `.specify/memory/constitution.md` |
| What a feature must do, and why | `specs/NNN-slug/spec.md` |
| How the system works today | `docs/` |
| A record of a change that shipped | the commit message (or `docs/archive/`) |

- Do NOT create `SOMETHING_FIX.md` / `*_SUMMARY.md` / `*_STATUS.md` files at the
  repo root or in `backend/`. This is how ~50 stale reports accumulated.
- **If a fix changes what the system is supposed to do, update the spec.** The
  writeup is scaffolding; the spec is the artifact.
- New feature: `.specify/scripts/bash/create-new-feature.sh "desc" --short-name "slug"`
- Backend one-off scripts go in `backend/scripts/{ops,data,simulations}/`, never
  at `backend/` root — that root is reserved for deploy-referenced entrypoints.
- Schema changes MUST land as a numbered file in `supabase/migrations/`. SQL
  applied by hand in the Supabase editor and not committed has already caused a
  production/repo drift incident — see `specs/002-multi-org-isolation/`.

## Commands

```bash
# Frontend
cd frontend && pnpm dev          # Dev server on :3000
cd frontend && pnpm build        # Production build

# Backend
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && celery -A app.worker worker --loglevel=info

# Testing
cd backend && pytest
cd frontend && pnpm test

# Database
npx supabase start
npx supabase db push
```

## Code Style

- Python: ruff for linting/formatting, pydantic for validation
- TypeScript: ESLint + Prettier, strict mode
- All API responses: JSON, errors use RFC 7807
- Structured JSON logging in Python backend

## Constitution

See `.specify/memory/constitution.md` for full principles. Key rules:

- Security-First: RLS on all tables, validate all input, no secrets in code
- Simplicity (YAGNI): Build only what's needed
- Clear Boundaries: Frontend = UI only, Backend = AI/ML + logic, Supabase = data
- Observability: Structured logging, AI token/latency tracking

## Recent Changes

- 001-hiring-automation-platform: AI hiring automation (resume screening + voice interviews)
- 002-multi-org-isolation: Org isolation, RLS `SECURITY DEFINER` model, admin/recruiter roles (retroactively specified from shipped work)
- 003-client-job-access: Read-only client access to specific jobs (`job_client_access`, migration 032, `/client` portal, admin "Client access" card)
- 2026-09-02 restructure: root/`backend/` report files archived to `docs/archive/`, `backend/` one-off scripts moved to `backend/scripts/`, docs split into `architecture/guides/operations`
- Recruiter custom questions (shipped, no spec): `interview_templates.custom_questions` (migration 014), "Custom Interview Questions" card in the job create/edit form; the interview agent asks them first, within `max_questions`
- Resume-anchored project questions (shipped, no spec): the agent reads `resume_data.parsed_projects` and asks named-project questions (`question_type = 'resume_project'`)
- 007-sidebar-nav-icons: lucide icon on each admin left-menu item
- 008-reopen-job: "Reopen" on closed jobs with a new future closing date or none
- 009-interview-question-ordering: anchored project questions spread and capped by `foundational_ratio`

<!-- MANUAL ADDITIONS START -->


## Communication Style

When explaining anything — a bug, a fix, a decision, a concept — always provide two layers:

1. **Technical explanation**: the precise details (what code changed, why, what the exact behavior is).
2. **Plain English explanation**: a simplified version immediately after, written as if explaining to someone who doesn't code. No jargon, no acronyms, just what it means in practice.

Keep both short. The plain English version should make the technical one optional to read.

## Working Agreement

This section governs every task, every session, for the entire lifetime of this project — not just today.

- Before starting any task or step, explain in plain, simple English what you're about to do and why. Wait for explicit approval before doing anything.
- Do the task — exactly as approved, nothing more.
- Before moving to the next task or step, explain in plain, simple English what you just did and what the actual result was (show real command output or file contents — not a paraphrase of what "should" have happened). Then stop and ask whether to proceed. Do not continue without approval.
- Never batch steps together. One step at a time: explain → approve → do → explain result → approve → next step. Repeat for every step, every day.
- If something fails or looks wrong, stop immediately, explain the problem in plain English, and propose a fix. Do not silently retry, skip, or work around it without approval.
- "Plain English" means no jargon-dumping and no assuming prior context is remembered — explain as if the person may not have the original spec in front of them right now.
- Do exactly what is specified — nothing more, nothing extra. Do not add fields, files, libraries, error handling, comments, refactors, or any "best practice" improvement that wasn't explicitly requested, no matter how small or reasonable it seems. If something appears missing or worth improving, do not add it on your own judgment — stop, explain what you noticed, and ask whether it should be included. The given instructions are the entire scope. Assume nothing beyond them.
- This working agreement overrides any instinct to move quickly or be efficient. Slower and fully confirmed at every step is the goal — not speed, and not initiative beyond what was asked.
- Do not let speed substitute for verification. This project has a specific, observed failure pattern to guard against: when something didn't work, the instinct was to make the smallest possible tweak (a different import style, an env flag, a longer wait time) and immediately re-run, rather than pausing to ask "do I actually know the full state of the system right now, or am I guessing?" That habit is what let a stale, half-finished job sit unnoticed in a queue and quietly contaminate the very next test run — the second run looked like a clean pass, but it was actually failing one leftover job and trivially passing an unrelated new one. When something fails, report the problem to the user and ask for consent before proceeding — do not guess-and-retry on your own.
<!-- MANUAL ADDITIONS END -->
