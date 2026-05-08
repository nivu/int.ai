# int.ai

AI-powered hiring automation platform that automates resume screening and conducts first-round voice interviews with an intelligent AI agent.

**Production:** [intai.nunnarilabs.com](https://intai.nunnarilabs.com) | **API:** [intai-production.up.railway.app](https://intai-production.up.railway.app/docs)

---

## Overview

int.ai replaces manual resume filtering and phone screens with a fully automated pipeline. Recruiters publish a job post, candidates apply with their resume, and the platform handles everything from AI-powered resume scoring to conducting live voice interviews — producing graded reports with hiring recommendations.

### Key Features

- **AI Resume Screening** — 4-layer scoring pipeline: semantic embeddings, skill match, experience alignment, and culture fit (GPT-4o mini)
- **Voice AI Interviews** — Real-time voice conversations with an AI interviewer using LiveKit + Deepgram STT/TTS + OpenAI
- **Auto-Evaluation** — Post-interview scoring on 4 dimensions with AI-generated narrative reports and hiring recommendations
- **Candidate Portal** — OTP-based login, real-time status tracking, interview scheduling
- **Admin Dashboard** — Job management, candidate comparison with radar charts, analytics with funnel visualization, CSV export
- **Automated Emails** — Confirmation, interview invitations, and outcome notifications via Resend

---

## Architecture

```
                    Netlify                          Railway (3 services)
                 ┌───────────┐         ┌──────────────────────────────────────┐
                 │  Next.js   │  HTTP   │  FastAPI API    (:8000)             │
  Browser ──────►│  Frontend  │────────►│  ├── /api/v1/applications           │
                 │  (App      │         │  ├── /api/v1/screening              │
                 │   Router)  │         │  ├── /api/v1/interview              │
                 └───────────┘         │  └── /api/v1/email                  │
                                       │                                      │
                                       │  Celery Worker                       │
                                       │  ├── screen_resume_task              │
                                       │  └── evaluate_interview_task         │
                                       │                                      │
                                       │  LiveKit Agent                       │
                                       │  └── Voice interview AI agent        │
                                       └──────────────────────────────────────┘
                                                        │
                          ┌─────────────────────────────┼──────────────────┐
                          │                             │                  │
                   ┌──────▼──────┐            ┌────────▼───────┐  ┌──────▼──────┐
                   │  Supabase   │            │  LiveKit Cloud │  │   Upstash   │
                   │  PostgreSQL │            │  (Singapore)   │  │   Redis     │
                   │  + pgvector │            │  WebRTC/Voice  │  │   (Celery)  │
                   │  + Auth     │            └────────────────┘  └─────────────┘
                   │  + Storage  │
                   └─────────────┘
```

---

## Complete Hiring Lifecycle

```
 ADMIN                           SYSTEM (Automated)                    CANDIDATE
 ─────                           ──────────────────                    ─────────

 ┌──────────────┐
 │ Create Job   │
 │ Post         │
 │ + Select     │
 │   Interview  │
 │   Template   │
 │ + Set Skills │
 │ + Set        │
 │   Threshold  │
 │ + Publish    │
 └──────┬───────┘
        │
        │  generates shareable link
        │  /apply/{slug}
        │                                                     ┌──────────────┐
        └─────────────────────────────────────────────────────► Candidate    │
                                                              │ opens link   │
                                                              │ fills form   │
                                                              │ uploads      │
                                                              │ resume       │
                                                              └──────┬───────┘
                                                                     │
                                              ┌──────────────────────┘
                                              │
                                              ▼
                                 ┌────────────────────────┐
                                 │  Application Created    │
                                 │  Status: "applied"      │
                                 └────────────┬───────────┘
                                              │
                                              ▼
                                 ┌────────────────────────┐
                                 │  📧 Confirmation Email  │
                                 │  "We received your      │
                                 │   application"          │
                                 └────────────┬───────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  🤖 AI Resume Screening        │
                              │  (Celery background task)      │
                              │                                │
                              │  1. Download resume from       │
                              │     Supabase Storage           │
                              │  2. Parse PDF/DOCX → markdown  │
                              │  3. Embedding similarity        │
                              │     (text-embedding-3-small)   │
                              │  4. Skill match (GPT-4o mini)  │
                              │  5. Experience match            │
                              │  6. Culture match               │
                              │  7. Weighted aggregate score    │
                              │  8. Store scores + embedding    │
                              └───────────────┬───────────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              │               │               │
                              ▼               ▼               ▼
                     Score ≥ threshold   In between    Score < threshold
                              │               │               │
                              ▼               ▼               ▼
                    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
                    │ Status:     │  │ Status:      │  │ Status:      │
                    │ "interview_ │  │ "screened"   │  │ "rejected"   │
                    │  sent"      │  │ (manual      │  │              │
                    │             │  │  review)     │  │              │
                    └──────┬──────┘  └──────────────┘  └──────┬───────┘
                           │                                   │
                           ▼                                   ▼
              ┌────────────────────────┐          ┌────────────────────────┐
              │ Interview session      │          │ 📧 Rejection Email     │
              │ created (pending)      │          │ "We've decided to move │
              │ + deadline set         │          │  forward with others"  │
              └────────────┬───────────┘          └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ 📧 Interview Invite    │
              │ "You've been invited   │                      ┌──────────────┐
              │  to an AI interview"   │─────────────────────► Candidate     │
              │  + deadline            │                      │ receives     │
              └────────────────────────┘                      │ email        │
                                                              └──────┬───────┘
                                                                     │
                                                                     ▼
                                                              ┌──────────────┐
                                                              │ Logs into    │
                                                              │ Portal (OTP) │
                                                              │              │
                                                              │ Sees status: │
                                                              │ "Interview   │
                                                              │  Invited"    │
                                                              │              │
                                                              │ Clicks       │
                                                              │ [Start       │
                                                              │  Interview]  │
                                                              └──────┬───────┘
                                                                     │
                                              ┌──────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  🎙️ AI Voice Interview         │
                              │                                │
                              │  LiveKit Room created           │
                              │  AI Agent auto-joins            │
                              │                                │
                              │  Agent: "Hi! Welcome to your   │
                              │   interview. Are you ready?"   │
                              │                                │
                              │  ┌──────────────────────────┐  │
                              │  │  Q&A Loop (5 questions)   │  │
                              │  │                           │  │
                              │  │  Agent asks question      │  │
                              │  │       ▼                   │  │
                              │  │  Candidate answers        │  │
                              │  │       ▼                   │  │
                              │  │  Agent acknowledges +     │  │
                              │  │  asks follow-up or next   │  │
                              │  │       ▼                   │  │
                              │  │  Q&A pair stored in DB    │  │
                              │  │  Progress sent to UI      │  │
                              │  │       ▼                   │  │
                              │  │  Repeat until max Qs      │  │
                              │  │  or max duration          │  │
                              │  └──────────────────────────┘  │
                              │                                │
                              │  Agent: "Thank you for your    │
                              │   time. The interview is now   │
                              │   complete."                   │
                              │                                │
                              │  Session status → "completed"  │
                              └───────────────┬───────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  🤖 AI Interview Evaluation    │
                              │  (Celery background task)      │
                              │                                │
                              │  For each Q&A pair:            │
                              │  - Technical accuracy  (0-10)  │
                              │  - Depth of understanding      │
                              │  - Communication clarity       │
                              │  - Relevance to JD             │
                              │                                │
                              │  Compute weighted grade (0-100)│
                              │  Generate AI summary           │
                              │  Determine recommendation      │
                              └───────────────┬───────────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              │               │               │
                              ▼               ▼               ▼
                       Grade ≥ 70       60 ≤ Grade < 70   Grade < 60
                              │               │               │
                              ▼               ▼               ▼
                    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
                    │ Status:     │  │ Status:      │  │ Status:      │
                    │"shortlisted"│  │"interviewed" │  │ "rejected"   │
                    │             │  │ (under       │  │              │
                    │             │  │  review)     │  │              │
                    └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
                           │               │               │
                           ▼               ▼               ▼
              ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐
              │📧 "Great    │  │📧 "Your app  │  │📧 "After careful     │
              │ news! You've│  │ is under     │  │ review, we've decided│
              │ been        │  │ review"      │  │ to move forward with │
              │ shortlisted"│  │              │  │ other candidates"    │
              └─────────────┘  └──────────────┘  └──────────────────────┘
                           │               │
                           ▼               ▼
              ┌────────────────────────────────────┐
              │  Interview Report Created           │
              │                                     │
              │  - Overall grade: 75/100            │
              │  - Recommendation: advance          │
              │  - Strengths: [...]                 │
              │  - Concerns: [...]                  │
              │  - AI narrative summary             │
              │  - Shareable link (7-day expiry)    │
              └──────────────────┬─────────────────┘
                                 │
 ┌───────────────────────────────┘
 │
 ▼
 ┌──────────────────┐
 │ Admin Dashboard   │
 │                   │
 │ - View all scores │
 │ - Compare         │
 │   candidates      │
 │ - Read AI reports │
 │ - Make final      │
 │   hiring decision │
 └──────────────────┘
```

### Application Status Transitions

```
applied → screened → interview_sent → in_progress → completed → shortlisted
                                                              → interviewed (borderline)
                                                              → rejected
         → rejected (screening fail)
         → screening_error (on failure)
```

### Emails Sent at Each Stage

| Stage | Trigger | Email Subject | Recipient |
|-------|---------|--------------|-----------|
| Application | Form submitted | "Application Received — {Job}" | Candidate |
| Screening Pass | Score ≥ threshold | "Interview Invitation — {Job}" | Candidate |
| Screening Fail | Score < threshold | "Application Update — {Job}" | Candidate |
| Interview → Advance | Grade ≥ 70 | "Great News — {Job}" | Candidate |
| Interview → Borderline | 60 ≤ Grade < 70 | "Interview Update — {Job}" | Candidate |
| Interview → Reject | Grade < 60 | "Interview Update — {Job}" | Candidate |

---

## End-to-End Flow

### 1. Job Post Creation
Admin creates a hiring post with job description, required skills, scoring weights, screening threshold, and selects an interview template (defines question count and duration).

### 2. Candidate Application
Candidate visits the shareable job link, fills the application form, uploads their resume (PDF/DOCX), and submits. Resume is stored in Supabase Storage. A confirmation email is sent automatically.

### 3. AI Resume Screening (Automated)
A Celery background task runs the 4-layer scoring pipeline:

| Layer | Method | What it measures |
|-------|--------|-----------------|
| Embedding Similarity | text-embedding-3-small + cosine similarity | Semantic match between resume and JD |
| Skill Match | GPT-4o mini (JSON mode) | Each required skill evaluated with evidence |
| Experience Match | GPT-4o mini (JSON mode) | Seniority, years, project complexity, domain relevance |
| Culture Match | GPT-4o mini (JSON mode) | Collaboration signals, communication style, initiative |

**Weighted aggregate score** determines the outcome:
- **Above threshold** → Auto-advance to interview, send invitation email, create interview session
- **Below threshold** → Auto-reject, send rejection email
- **In between** → Flag for manual review

### 4. Voice AI Interview
Candidate logs into the portal, sees the pending interview, and clicks "Start Interview":

1. **Room Creation** — Backend creates a LiveKit room and generates a candidate access token
2. **Agent Joins** — LiveKit Agent (running on Railway) auto-dispatches to the room
3. **Greeting** — AI interviewer greets the candidate
4. **Q&A Loop** — Agent asks questions based on resume + JD, listens to answers, asks follow-ups
5. **Tracking** — Question count and elapsed time tracked in real-time
6. **Termination** — Interview ends at max questions or max duration, agent says farewell
7. **Q&A Storage** — Each question-answer pair stored in `interview_qa` table during the conversation

### 5. Post-Interview Evaluation (Automated)
A Celery task scores each Q&A pair on 4 dimensions via GPT-4o mini:

| Dimension | Weight |
|-----------|--------|
| Technical Accuracy | 35% |
| Depth of Understanding | 25% |
| Communication Clarity | 20% |
| Relevance to JD | 20% |

Produces:
- **Overall grade** (0-100)
- **Recommendation**: advance / borderline / reject
- **AI narrative summary** with strengths and concerns
- **Shareable report link** (expires in 7 days)

Application status is updated and a post-interview outcome email is sent to the candidate.

### 6. Admin Review
Admins view results in the dashboard:
- Candidate table with all scores and status
- Side-by-side comparison with radar charts
- Interview reports with per-question scoring
- Hiring funnel analytics with CSV export

---

## Interview Voice Agent — Detailed Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CANDIDATE BROWSER                            │
│                                                                     │
│  /interview                        /interview/session               │
│  ┌─────────────────────┐          ┌──────────────────────────────┐  │
│  │  Interview Checklist │  click   │  LiveKit Room                │  │
│  │                      │ "Ready"  │  ┌────────────────────────┐  │  │
│  │  - Browser check     │────────►│  │  BarVisualizer          │  │  │
│  │  - Mic permission    │          │  │  (voice-reactive UI)    │  │  │
│  │  - Duration & Qs     │          │  │                        │  │  │
│  │                      │          │  │  Question 3 of 5       │  │  │
│  │                      │          │  │  ⏱ 02:45               │  │  │
│  │                      │          │  │                        │  │  │
│  │                      │          │  │  [End Interview]       │  │  │
│  │                      │          │  └────────────────────────┘  │  │
│  └─────────────────────┘          └──────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │ WebRTC (audio)
                                       │
                        ┌──────────────▼──────────────┐
                        │       LiveKit Cloud          │
                        │      (Singapore region)      │
                        │                              │
                        │   Room: interview-{uuid}     │
                        │   Participants:               │
                        │   - candidate-{uuid}         │
                        │   - agent (AI interviewer)   │
                        └──────────────┬──────────────┘
                                       │ dispatches
                                       │
                        ┌──────────────▼──────────────┐
                        │    LiveKit Agent (Railway)    │
                        │                              │
                        │  ┌─────────┐  ┌──────────┐  │
                        │  │Deepgram │  │ Deepgram │  │
                        │  │  STT    │  │   TTS    │  │
                        │  │(Nova-2) │  │          │  │
                        │  └────┬────┘  └────▲─────┘  │
                        │       │            │         │
                        │  ┌────▼────────────┴─────┐  │
                        │  │   OpenAI GPT-4o mini   │  │
                        │  │                        │  │
                        │  │  System: AI interviewer │  │
                        │  │  Context: resume + JD   │  │
                        │  │  Style: warm, probing   │  │
                        │  └────────────────────────┘  │
                        │                              │
                        │  Events:                     │
                        │  - conversation_item_added   │
                        │    → store Q&A to Supabase   │
                        │  - user_state: speaking→     │
                        │    listening → count question │
                        │    → send progress via data  │
                        │      channel to frontend     │
                        │  - max questions reached     │
                        │    → farewell + session_end  │
                        │  - duration timeout          │
                        │    → farewell + session_end  │
                        └─────────────────────────────┘
```

### Voice Pipeline Detail

```
Candidate speaks
    │
    ▼
Deepgram STT (Nova-2, Indian English, streaming)
    │ text transcript
    ▼
OpenAI GPT-4o mini (streaming tokens)
    │ System prompt: professional interviewer persona
    │ Context: candidate resume (markdown) + job description
    │ Conversation history: all prior Q&A
    │ Behavior: acknowledge answer → ask next question
    │           or probe deeper if answer was vague
    ▼
Deepgram TTS (streaming audio)
    │
    ▼
Candidate hears AI response (~1-2s latency)
```

### Interview Session Lifecycle

```
pending ──► in_progress ──► completed
   │                           │
   │  candidate clicks         │  max questions OR
   │  "I'm Ready"              │  max duration OR
   │  → create LiveKit room    │  candidate clicks "End"
   │  → agent auto-joins       │  → agent says farewell
   │  → greeting sent          │  → Q&A scoring triggered
   │                           │  → evaluation report created
   │                           │  → outcome email sent
   │                           │
   └──► expired                └──► evaluation complete
        (deadline passed)           → application status updated
```

### Data Captured During Interview

| Data | Storage | When |
|------|---------|------|
| Each Q&A pair (question + answer text) | `interview_qa` table | Real-time, as each exchange completes |
| Question count | Data channel → frontend | Real-time, after each user answer |
| Session duration | `interview_sessions.duration_seconds` | On session end |
| Session status transitions | `interview_sessions.status` | pending → in_progress → completed |
| Consent timestamp | `interview_sessions.consent_given_at` | When candidate clicks "Ready" |

### Interview Templates

Templates define the interview parameters:

| Field | Example | Description |
|-------|---------|-------------|
| `name` | AI/ML Engineer | Template name |
| `max_questions` | 5 | Interview stops after N answered questions |
| `max_duration_minutes` | 5 | Interview stops after N minutes |
| `foundational_ratio` | 0.4 | 40% foundational / 60% project-based questions |
| `must_ask_topics` | ["deep learning", "model deployment"] | Topics the agent must cover |
| `scoring_weights` | {"technical": 0.35, ...} | Weights for post-interview evaluation |

Templates are linked to hiring posts. When a candidate passes screening, an interview session is automatically created using the linked template.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend API | Python 3.11+, FastAPI, Pydantic |
| Task Queue | Celery + Redis (Upstash) |
| Voice Interview | LiveKit Agents SDK + Deepgram STT/TTS + OpenAI GPT-4o mini |
| LLM | OpenAI GPT-4o mini (screening, evaluation, question generation) |
| Embeddings | text-embedding-3-small (OpenAI) via sentence-transformers |
| Database | Supabase PostgreSQL + pgvector |
| Auth | Supabase Auth (password for admins, OTP for candidates) |
| File Storage | Supabase Storage |
| Email | Resend |
| Frontend Hosting | Netlify |
| Backend Hosting | Railway (3 services: API, Celery worker, LiveKit agent) |
| Voice/WebRTC | LiveKit Cloud (Singapore region) |

---

## Project Structure

```
int.ai/
├── frontend/                        # Next.js (TypeScript, App Router)
│   ├── app/
│   │   ├── page.tsx                 # Landing page
│   │   ├── (admin)/                 # Admin dashboard (auth required)
│   │   │   ├── dashboard/           # Overview with stats
│   │   │   ├── jobs/                # Job post CRUD
│   │   │   ├── candidates/          # Candidate table with scores
│   │   │   ├── templates/           # Interview template management
│   │   │   ├── analytics/           # Funnel + CSV export
│   │   │   └── settings/            # Org settings
│   │   ├── (candidate)/             # Candidate portal (OTP auth)
│   │   │   ├── portal/              # Application status tracker
│   │   │   └── interview/           # Interview checklist + voice room
│   │   ├── apply/[slug]/            # Public application form
│   │   └── auth/login/              # Login (admin + candidate)
│   ├── components/
│   │   ├── ui/                      # shadcn/ui base components
│   │   ├── admin/                   # Admin-specific (tables, charts)
│   │   ├── candidate/               # Candidate-specific (status, interview)
│   │   └── shared/                  # Shared (logout button)
│   └── lib/
│       ├── supabase/                # Supabase client (browser + server)
│       └── api/                     # Backend API fetch wrapper
│
├── backend/                         # Python (FastAPI)
│   ├── app/
│   │   ├── main.py                  # FastAPI app + CORS + routing
│   │   ├── config.py                # Pydantic Settings (env vars)
│   │   ├── worker.py                # Celery app config
│   │   ├── api/                     # Route handlers
│   │   │   ├── applications.py      # POST /applications/submit
│   │   │   ├── screening.py         # POST /screening/trigger
│   │   │   ├── interview.py         # POST /interview/create-room
│   │   │   ├── email.py             # POST /email/send
│   │   │   └── webhooks.py          # Application webhooks
│   │   ├── services/                # Business logic
│   │   │   ├── resume_parser.py     # PDF/DOCX → structured JSON
│   │   │   ├── scoring.py           # 4-layer AI scoring
│   │   │   ├── embeddings.py        # text-embedding-3-small
│   │   │   ├── email.py             # Resend email templates
│   │   │   └── supabase.py          # Supabase client helpers
│   │   ├── interview/               # LiveKit agent
│   │   │   ├── agent.py             # Agent factory + session controller
│   │   │   ├── entrypoint.py        # LiveKit worker entrypoint
│   │   │   ├── question_gen.py      # Dynamic question generation
│   │   │   ├── evaluator.py         # Post-interview scoring + reports
│   │   │   └── session_manager.py   # Room creation + token management
│   │   ├── tasks/                   # Celery tasks
│   │   │   ├── screen_resume.py     # Resume screening pipeline
│   │   │   └── evaluate_interview.py # Interview evaluation pipeline
│   │   └── models/                  # Pydantic request/response models
│   ├── start_api.py                 # Uvicorn starter (reads PORT env)
│   ├── run_agent.py                 # LiveKit agent CLI runner
│   ├── Dockerfile                   # Single image for all 3 services
│   └── pyproject.toml               # Python dependencies
│
├── supabase/
│   └── migrations/                  # SQL migrations
│       ├── 001_initial_schema.sql   # 10 tables + pgvector
│       ├── 002_enable_pgvector.sql
│       ├── 003_storage_buckets.sql
│       ├── 004_rls_policies.sql     # Row Level Security
│       ├── 005_functions.sql
│       └── 006_interview_sessions_nullable_consent.sql
│
└── specs/                           # Specification documents
    └── 001-hiring-automation-platform/
```

---

## Database Schema

```
organizations ──┬── team_members (user_id, role: admin/recruiter)
                ├── interview_templates (max_questions, max_duration_minutes)
                └── hiring_posts (title, description, required_skills, scoring_weights)
                        │
                        └── applications (candidate_id, resume_url, scores, status)
                                │
                                ├── candidates (full_name, email, auth_user_id)
                                ├── resume_data (parsed_skills, parsed_experience, embeddings)
                                └── interview_sessions (template_id, status, deadline)
                                        ├── interview_qa (question_text, answer_text, scores)
                                        └── interview_reports (overall_grade, recommendation, summary)
```

**10 tables** with RLS policies for admin, recruiter, and candidate access levels.

---

## Environment Variables

### Backend (.env)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-proj-...
DEEPGRAM_API_KEY=...
LIVEKIT_URL=wss://xxx.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
REDIS_URL=rediss://...
RESEND_API_KEY=re_...
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_LIVEKIT_URL=wss://xxx.livekit.cloud
```

---

## Local Development

```bash
# Prerequisites: Node.js 20+, Python 3.11+, pnpm, uv

# Frontend
cd frontend
pnpm install
pnpm dev                    # http://localhost:3000

# Backend API
cd backend
uv sync
uvicorn app.main:app --reload --port 8000

# Celery Worker
cd backend
celery -A app.worker worker --loglevel=info

# LiveKit Agent
cd backend
python run_agent.py start

# Database
npx supabase db push
```

---

## Deployment

| Service | Platform | Branch | Auto-deploy |
|---------|----------|--------|-------------|
| Frontend | Netlify | prod | Yes |
| Backend API | Railway | prod | Yes |
| Celery Worker | Railway | prod | Yes |
| LiveKit Agent | Railway | prod | Yes |

All three Railway services share the same Dockerfile with different start commands:
- **API**: `python start_api.py`
- **Celery**: `celery -A app.worker worker --loglevel=info --concurrency=4`
- **LiveKit**: `python run_agent.py start`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/v1/applications/submit` | Submit candidate application |
| POST | `/api/v1/screening/trigger` | Trigger resume screening |
| GET | `/api/v1/screening/status/{task_id}` | Check screening status |
| POST | `/api/v1/interview/create-room` | Create LiveKit interview room |
| POST | `/api/v1/interview/reconnect` | Reconnect to interview session |
| POST | `/api/v1/interview/evaluate` | Trigger interview evaluation |
| POST | `/api/v1/email/send` | Send templated email |
| POST | `/api/v1/email/application-confirmation` | Send application confirmation |

Full API docs: [/docs](https://intai-production.up.railway.app/docs) (Swagger UI)

---

## Email Templates

| Trigger | Email | Recipient |
|---------|-------|-----------|
| Application submitted | Confirmation with portal link | Candidate |
| Screening passed | Interview invitation with deadline | Candidate |
| Screening failed | Polite rejection | Candidate |
| Interview evaluated — advance | Shortlisted notification | Candidate |
| Interview evaluated — borderline | Under review notification | Candidate |
| Interview evaluated — reject | Polite decline | Candidate |

---

## License

Proprietary. Built by [Nunnari Labs](https://nunnarilabs.com).
