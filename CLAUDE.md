# int.ai Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-05

## Active Technologies

- Python 3.11+ (backend): FastAPI, LiveKit Agents SDK, Deepgram SDK, Gemini SDK, Celery, sentence-transformers
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
<!-- MANUAL ADDITIONS END -->
