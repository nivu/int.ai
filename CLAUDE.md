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
├── app/
│   ├── api/       # Route handlers
│   ├── services/  # Business logic
│   ├── interview/ # LiveKit agent
│   ├── models/    # Pydantic models
│   ├── tasks/     # Celery tasks
│   └── worker.py
└── pyproject.toml

supabase/
└── migrations/
```

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

<!-- MANUAL ADDITIONS START -->
## Planned Features

### Recruiter Custom Questions
Recruiters should be able to define a list of custom interview questions when creating or editing a job post. During an AI audio interview, the interviewer agent must ask these recruiter-defined questions as part of the interview, staying within the job post's configured total question limit. The feature needs UI in both the job creation and job editing flows, and backend/agent changes to pull and deliver those questions during a live interview. This should not interfere with or break any existing workflows.

### Resume-Anchored Project Questions
A subset of the AI interviewer's questions should explicitly reference specific projects and skills from the candidate's resume by name — e.g. "I noticed you worked on X project, can you walk me through the challenges you faced?" — rather than asking generically about past experience. These questions count within the existing total question limit (not on top of it). The structured project data already exists in `resume_data.parsed_projects` (populated during resume screening); no new database migration is needed. Changes are limited to the backend interview agent: fetch `parsed_projects` at interview start, queue them in `QuestionGenerator`, and generate a dedicated anchored LLM question for each project at the appropriate point in the ratio-controlled question flow. No frontend changes, no API changes, no other interview logic should be affected.


## Communication Style

When explaining anything — a bug, a fix, a decision, a concept — always provide two layers:

1. **Technical explanation**: the precise details (what code changed, why, what the exact behavior is).
2. **Plain English explanation**: a simplified version immediately after, written as if explaining to someone who doesn't code. No jargon, no acronyms, just what it means in practice.

Keep both short. The plain English version should make the technical one optional to read.
<!-- MANUAL ADDITIONS END -->
