# Quickstart: AI-Powered Hiring Automation Platform

**Branch**: `001-hiring-automation-platform`
**Date**: 2026-04-05

## Prerequisites

- Node.js 20+ and pnpm
- Python 3.11+ and uv (or pip)
- Supabase CLI (`npx supabase`)
- Redis (local via Docker or Upstash for dev)
- LiveKit CLI (for local dev server, optional)

## 1. Clone and Install

```bash
git clone <repo-url> int.ai
cd int.ai

# Frontend
cd frontend
pnpm install

# Backend
cd ../backend
uv sync  # or: pip install -r requirements.txt
```

## 2. Environment Setup

```bash
# Copy env templates
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

**Required environment variables:**

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | Supabase service role key |
| `SUPABASE_URL` | backend | Supabase project URL |
| `GEMINI_API_KEY` | backend | Claude API key |
| `DEEPGRAM_API_KEY` | backend | Deepgram STT/TTS key |
| `LIVEKIT_URL` | backend | LiveKit server URL |
| `LIVEKIT_API_KEY` | backend | LiveKit API key |
| `LIVEKIT_API_SECRET` | backend | LiveKit API secret |
| `REDIS_URL` | backend | Redis connection URL |
| `RESEND_API_KEY` | backend | Email service API key |

## 3. Database Setup

```bash
# Start Supabase locally
npx supabase start

# Run migrations
npx supabase db push

# Enable pgvector extension (in migration)
# CREATE EXTENSION IF NOT EXISTS vector;
```

## 4. Start Services

```bash
# Terminal 1: Frontend
cd frontend
pnpm dev
# → http://localhost:3000

# Terminal 2: Backend API
cd backend
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000

# Terminal 3: Celery worker
cd backend
celery -A app.worker worker --loglevel=info

# Terminal 4: Redis (if not using cloud)
docker run -p 6379:6379 redis:alpine
```

## 5. Verify Setup

1. Open `http://localhost:3000` — admin dashboard should load
2. Open `http://localhost:8000/docs` — FastAPI Swagger UI
3. Create a test admin user in Supabase Auth
4. Create a hiring post, copy the shareable link
5. Open the link in an incognito window — candidate form should render

## Project Structure

```
int.ai/
├── frontend/                    # Next.js (TypeScript, App Router)
│   ├── app/
│   │   ├── (admin)/             # Admin dashboard routes
│   │   │   ├── dashboard/
│   │   │   ├── jobs/
│   │   │   ├── candidates/
│   │   │   ├── templates/
│   │   │   ├── analytics/
│   │   │   ├── settings/
│   │   │   └── layout.tsx
│   │   ├── (candidate)/         # Candidate portal routes
│   │   │   ├── portal/
│   │   │   ├── interview/
│   │   │   └── layout.tsx
│   │   ├── apply/[slug]/        # Public application form
│   │   ├── auth/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── admin/               # Admin-specific components
│   │   ├── candidate/           # Candidate-specific components
│   │   └── shared/              # Shared components
│   ├── lib/
│   │   ├── supabase/            # Supabase client setup
│   │   └── api/                 # Backend API client
│   └── package.json
├── backend/                     # Python (FastAPI)
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── api/                 # Route handlers
│   │   │   ├── screening.py
│   │   │   ├── interview.py
│   │   │   └── email.py
│   │   ├── services/            # Business logic
│   │   │   ├── resume_parser.py
│   │   │   ├── scoring.py
│   │   │   ├── embeddings.py
│   │   │   └── email.py
│   │   ├── interview/           # LiveKit agent
│   │   │   ├── agent.py         # VoicePipelineAgent setup
│   │   │   ├── question_gen.py  # Dynamic question generation
│   │   │   └── evaluator.py     # Post-interview scoring
│   │   ├── models/              # Pydantic models
│   │   ├── worker.py            # Celery app
│   │   └── config.py            # Settings
│   ├── pyproject.toml
│   └── .env.example
├── supabase/
│   ├── migrations/              # SQL migrations
│   └── config.toml
├── specs/                       # Spec-kit specs
└── .specify/                    # Spec-kit config
```
