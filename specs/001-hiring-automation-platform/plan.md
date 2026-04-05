# Implementation Plan: AI-Powered Hiring Automation Platform

**Branch**: `001-hiring-automation-platform` | **Date**: 2026-04-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-hiring-automation-platform/spec.md`

## Summary

Build an end-to-end hiring automation platform where admins publish
time-bound job posts, candidates apply with resumes, the system
auto-screens via a three-layer AI scoring pipeline (embeddings + LLM
skill/experience/culture match), and qualified candidates are
automatically invited to a voice-based AI interview conducted by a
LiveKit Agent with Deepgram STT/TTS and Claude Sonnet. Post-interview
evaluation, grading, and reporting are fully automated.

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript 5.x (frontend)
**Primary Dependencies**: FastAPI, LiveKit Agents SDK, Deepgram SDK,
Gemini SDK, sentence-transformers, Celery, @supabase/ssr, Next.js 14+,
shadcn/ui, Recharts, TanStack Table
**Storage**: Supabase PostgreSQL + pgvector extension + Supabase Storage
**Testing**: pytest (backend), vitest + Playwright (frontend)
**Target Platform**: Web (modern browsers), Linux containers (backend)
**Project Type**: Web application (admin dashboard + candidate portal +
Python backend + AI interview agent)
**Performance Goals**: <2s voice interview latency, <5min resume screening,
50 concurrent screenings
**Constraints**: <2s e2e interview response, 5MB max resume upload,
OWASP Top 10 compliance, RLS on all tables
**Scale/Scope**: ~10 admin pages, ~5 candidate pages, 8 API endpoints,
10 DB tables, 4 storage buckets

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle              | Status | Evidence                                                                                                                      |
| ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| I. Security-First      | PASS   | RLS on all tables, RBAC via JWT claims, OTP rate limiting, file validation, no PII in logs, consent logging                   |
| II. Simplicity (YAGNI) | PASS   | Phase 1 scopes out SMS, bias algorithms, multi-language. No speculative abstractions.                                         |
| III. Data Integrity    | PASS   | Reversible migrations (Supabase CLI), transactional writes, RLS tested before deploy, no internal ID leaks (RFC 7807 errors)  |
| IV. Clear Boundaries   | PASS   | Next.js = UI only, FastAPI = AI/ML + business logic, Supabase = data. Each independently deployable. API contracts defined.   |
| V. Observability       | PASS   | Structured JSON logging in backend, request metadata logging, AI token/latency tracking                                       |

**Post-Phase 1 re-check**: All gates still pass. Data model enforces
boundaries (no business logic in frontend). Interview agent is a separate
deployable Python process.

## Project Structure

### Documentation (this feature)

```text
specs/001-hiring-automation-platform/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/                        # Next.js (TypeScript, App Router)
├── app/
│   ├── (admin)/                 # Admin dashboard
│   │   ├── dashboard/
│   │   ├── jobs/
│   │   │   ├── page.tsx         # Job list
│   │   │   ├── new/page.tsx     # Create job
│   │   │   └── [id]/
│   │   │       ├── page.tsx     # Job detail
│   │   │       └── candidates/page.tsx
│   │   ├── candidates/
│   │   │   ├── page.tsx         # All candidates
│   │   │   ├── [id]/page.tsx    # Candidate detail
│   │   │   └── compare/page.tsx # Side-by-side
│   │   ├── templates/
│   │   ├── analytics/
│   │   ├── settings/
│   │   └── layout.tsx           # Admin layout + auth guard
│   ├── (candidate)/             # Candidate portal
│   │   ├── portal/
│   │   │   └── page.tsx         # Status tracking
│   │   ├── interview/
│   │   │   ├── page.tsx         # Pre-interview checklist
│   │   │   └── session/page.tsx # Live interview UI
│   │   ��── layout.tsx           # Candidate layout + OTP guard
│   ├── apply/
│   │   └── [slug]/page.tsx      # Public application form
│   ├── auth/
│   │   ├── login/page.tsx       # Admin login
│   │   └── callback/route.ts    # Auth callback
│   └── layout.tsx               # Root layout
├── components/
│   ├── ui/                      # shadcn/ui
│   ├── admin/
│   │   ├── job-form.tsx
│   │   ├── candidate-table.tsx
│   │   ├── candidate-detail.tsx
│   │   ├── comparison-view.tsx
│   │   ├── interview-report.tsx
│   │   └── analytics-charts.tsx
│   ├── candidate/
│   │   ├── application-form.tsx
│   │   ├── status-tracker.tsx
│   │   ├── interview-checklist.tsx
│   │   └── interview-room.tsx
│   └── shared/
│       ├── audio-player.tsx
│       ├── score-radar.tsx
│       └── file-upload.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # Browser client
│   │   ├── server.ts            # Server Component client
│   │   └── middleware.ts        # Auth middleware
│   └── api/
│       └── backend.ts           # FastAPI client
├── middleware.ts                 # Route protection
└── package.json

backend/                         # Python (FastAPI)
├── app/
│   ├── main.py                  # FastAPI app, CORS, middleware
│   ├── config.py                # Pydantic settings
│   ├── api/
│   │   ├── __init__.py
│   │   ├── screening.py         # /api/v1/screening/*
│   │   ├── interview.py         # /api/v1/interview/*
│   │   ├── email.py             # /api/v1/email/*
│   │   └── webhooks.py          # Supabase + LiveKit webhooks
│   ├── services/
│   │   ├── __init__.py
│   │   ├── resume_parser.py     # PDF/DOCX → markdown
│   │   ├── scoring.py           # Three-layer scoring pipeline
│   │   ├── embeddings.py        # sentence-transformers + pgvector
│   │   ├── email.py             # Transactional email via Resend
│   │   └── supabase.py          # Supabase client wrapper
│   ├── interview/
│   │   ├── __init__.py
│   │   ├── agent.py             # LiveKit VoicePipelineAgent
│   │   ├── question_gen.py      # Dynamic question generation
│   │   └── evaluator.py         # Post-interview evaluation
│   ├── models/
│   │   ├── __init__.py
│   │   ├── screening.py         # Pydantic request/response
│   │   ├── interview.py
│   │   └── email.py
│   ├── worker.py                # Celery app + task definitions
│   ��── tasks/
│       ├── __init__.py
│       ├── screen_resume.py     # Celery task: full pipeline
│       └── evaluate_interview.py # Celery task: scoring
├── pyproject.toml
└── .env.example

supabase/
├── migrations/
│   ���── 001_initial_schema.sql   # All tables, indexes, RLS
│   ├── 002_enable_pgvector.sql  # vector extension
│   └── 003_storage_buckets.sql  # Bucket creation + policies
├── seed.sql                     # Dev data + role presets
└── config.toml
```

**Structure Decision**: Web application with three independently deployable
components: Next.js frontend (Vercel), FastAPI backend (Railway/Fly.io),
and LiveKit interview agent (same backend or separate worker). Supabase
is the shared data layer with RLS enforcing all access control.

## Complexity Tracking

> No constitution violations to justify. Structure follows Clear
> Boundaries principle — three layers, each independently deployable.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Celery + Redis (separate infra) | 50 concurrent resume screenings | FastAPI BackgroundTasks blocks workers at scale |
| LiveKit Cloud (external service) | WebRTC transport, recording, barge-in | Building WebRTC infra from scratch violates Simplicity |
