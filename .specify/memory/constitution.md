<!--
Sync Impact Report
===================
Version change: 1.1.0 -> 2.0.0 (MAJOR - full narrative rewrite covering all three user journeys)
Modified principles: All — significantly expanded with product context and per-layer guidance
Added sections:
  - The Three Journeys (product narrative: Recruiter, Candidate, Admin)
  - AI Pipeline Constraints
  - System Boundaries & Integration Rules
  - Data Model Integrity
Removed sections: None
Templates requiring updates:
  - plan-template.md: OK
  - spec-template.md: OK
  - tasks-template.md: OK
Follow-up TODOs: None
-->

# int.ai Constitution

---

## What This Platform Is

int.ai is an AI-powered hiring automation platform. It sits at the intersection
of three distinct human experiences — the **recruiter** who must find the right
person from hundreds of applicants, the **candidate** who has put their career
ambitions on the line with a single resume upload, and the **admin** who shapes
the rules and processes that govern the entire organization's hiring.

Every line of code in this codebase exists to serve one of those three
people. When a feature is proposed, the first question is always: *whose
experience does this improve, and how?*

This document is the highest-authority governing document for this project.
All implementation decisions, architectural choices, and tradeoffs MUST comply
with the principles described here.

---

## The Three Journeys

Understanding these three journeys is prerequisite to contributing to this
codebase. Every feature lives within one of them.

### The Recruiter's Journey

A recruiter opens the platform for the first time and creates a job post.
They fill in a title, a department, a location type. They describe the role —
or let the AI draft a description from the metadata they've already entered.
They specify the skills the ideal candidate must have, how many years of
experience they're looking for, the interview template they want applied,
and a screening threshold: a number between 0 and 100 that represents the
minimum overall score a candidate must achieve to receive an interview invitation
automatically.

The job is published. A shareable link is generated (e.g., `/apply/42apf1xy`).
The recruiter shares it, and then — crucially — they don't have to do anything
else until the platform tells them to.

When resumes start flowing in, the AI pipeline runs silently in the background.
Each resume is downloaded from storage, text is extracted, and four parallel
scoring tasks fire simultaneously: an embedding similarity check against the
job description, a skill match analysis against the required skills list, an
experience alignment assessment, and a culture fit evaluation. A weighted
overall score is computed. Candidates who clear the threshold receive an
automated interview invitation. Candidates who fall well below it receive a
polite rejection. The band in between — neither clearly in nor clearly out —
is surfaced to the recruiter as "Awaiting Review," requiring a human call.

The recruiter's dashboard shows everything in real time. KPI cards update
as candidates move through the pipeline. The candidates table is sortable and
filterable by score, status, job, and more. Clicking into a candidate reveals
their parsed profile (skills, experience timeline, education, projects,
certifications), their AI-computed score breakdown with evidence extracts,
and — after an interview — a full Q&A transcript, per-question scores across
four dimensions, an AI narrative summary, and a final recommendation.

The recruiter can write private notes, override the AI's recommendation, and
mark a candidate as hired or rejected regardless of what the AI says. The AI
is a first-pass filter, not the final word. Humans make the final call.

For comparing finalists, a side-by-side radar chart view lets the recruiter
see how two or more candidates stack up across all dimensions simultaneously.

The Analytics page shows the health of the funnel: how many applied, how many
were screened, how many made it to interview, how many were shortlisted. Score
distributions, pass rates by job, timing metrics (how long does it take to
go from application to screen? screen to interview?), and dimension-level
scoring trends are all available. A full CSV export is available for external
analysis.

### The Candidate's Journey

The candidate finds the apply link for a job they're interested in. The page
shows the full job description, department, and location type. They fill in
their name, email, phone, current role, and upload their resume in PDF or
DOCX format. They hit submit. A confirmation email arrives with a link to
their candidate portal.

From this point on, the candidate's experience is built around two things:
transparency and simplicity.

The candidate portal (accessed via OTP-based email login, no passwords) shows
every application they've submitted across every job. Each application has a
visual status tracker — a horizontal stepper on desktop, vertical on mobile —
that shows exactly where they are in the pipeline: Applied, Screening Complete,
Interview Invited, Interview Complete, Decision Pending, Outcome. When the AI
changes their status, the tracker updates in real time without a page refresh.
If they've been rejected, the stepper shows their progress up to the point of
rejection in green, with the remaining steps dimmed, and a clear red banner
below: "Application not selected" or "Not advancing after interview." There is
no ambiguous "Processing" or "Evaluating" state that leaves a rejected candidate
in limbo.

When a candidate clears the screening threshold, they receive an interview
invitation email with a link and a deadline (typically seven days). Their
portal shows a "Start Interview" button. Clicking it takes them to a
preparation page with a checklist — microphone test, browser compatibility,
environment tips — and a consent form for recording. Only after consenting do
they enter the interview room.

The interview is a live voice conversation with an AI agent. The agent is warm,
professional, and unhurried. It greets the candidate, asks questions that are
genuinely contextual to their resume and the job description (not generic
trivia), listens to their full answer before moving on, and probes gently if
an answer is unclear. The session respects the template's maximum question
count and maximum duration. When the session ends, the candidate sees a
thank-you screen and is directed back to their portal.

If a candidate is ultimately not advancing after an interview, their portal
shows a "Retake Interview" button alongside the rejection message. When they
click it, the backend resets the application status and creates a fresh interview
session, allowing them to have another attempt without any manual recruiter
intervention.

Shareable interview reports with a 7-day expiry token are generated post-
interview, giving candidates a record of their performance if they wish.

### The Admin's Journey

The admin sets the rules. They manage the organization's team: inviting new
recruiters and hiring managers, deactivating members who leave, assigning roles.
They configure organization-wide defaults — default scoring weights, default
screening threshold, default interview template — that all new job posts inherit
until overridden at the job level.

Admins define interview templates: how many questions should be asked (default
ten), what the maximum session duration is (default 45 minutes), what ratio of
foundational to project-based questions to ask (default 60% foundational), how
to weight the four interview scoring dimensions (technical accuracy, depth of
understanding, communication clarity, relevance to the job description), and
which topics must be covered in every interview for that role type.

Admins also control data retention: after how many days (default 365) should
application data, resume files, and interview recordings be automatically
purged.

This is the governance layer. Without it, the recruiter and candidate
experiences have no shape. The admin defines the shape.

---

## Core Principles

### I. Security-First (NON-NEGOTIABLE)

The platform handles resume files, personal contact information, interview
recordings, and compensation-relevant evaluation scores. A breach is not an
embarrassing incident — it is a fundamental betrayal of the candidates who
trusted us with their careers and the recruiters who trusted us with their
hiring decisions. Security is non-negotiable.

- All user input MUST be validated and sanitized at system boundaries (the
  public apply form, all API request bodies, all query parameters)
- Every API route MUST enforce authentication; recruiter routes require a
  valid Supabase session; candidate routes require a valid JWT from Supabase
  Auth; public apply endpoints are intentionally unauthenticated but MUST be
  rate-limited and validated
- Secrets (API keys, database URLs, LiveKit credentials, Resend keys) MUST
  NOT appear in version control under any circumstances — use environment
  variables in all environments
- Supabase Row Level Security (RLS) MUST be enabled on every table; RLS
  policies are maintained in `supabase/migrations/004_rls_policies.sql` and
  any new table MUST have its RLS policy defined in the same migration that
  creates the table
- The Next.js server-side catch-all proxy (`/api/proxy/[...path]`) is the
  ONLY path through which the browser may reach the FastAPI backend — the
  backend URL (`BACKEND_URL`) is a server-side secret and MUST NOT be
  embedded in any client-side bundle or exposed via `NEXT_PUBLIC_` variables
- OWASP Top 10 vulnerabilities MUST be actively prevented; SQL injection is
  mitigated by using the Supabase client's parameterised query builder; XSS
  is mitigated by React's default escaping; CSRF does not apply because the
  API is token-authenticated
- Resume files in Supabase Storage are private by default; only service-role
  reads are permitted from the backend; the browser NEVER gets a direct
  storage URL for another candidate's resume

### II. Simplicity (YAGNI)

The three journeys described above are the product. Anything that does not
serve one of those journeys is not the product. We have deliberately avoided
the temptation to build every possible feature, and this principle protects
that discipline.

- Every feature MUST trace back to a concrete need in one of the three journeys
- No speculative abstractions — do not design for a hypothetical fourth journey
  or a configuration option that no user has asked for
- Prefer standard library and framework capabilities over custom solutions:
  use Next.js middleware for auth guards, use Supabase's built-in OTP for
  candidate login, use Celery's built-in retry logic for task failures
- Three similar lines of code are preferable to a premature abstraction; do
  not create a helper until you have three genuine callers
- If a new dependency can be replaced with fewer than 50 lines of clear code,
  replace it; each dependency is a surface area for vulnerabilities and
  breaking changes

### III. Data Integrity

Every database row in this system represents a real person's career moment
or a real organization's hiring decision. Data corruption or loss is not a
UX problem — it is a product failure with human consequences.

- All schema changes MUST be expressed as numbered migration files in
  `supabase/migrations/` (e.g., `010_add_consent_flag.sql`); never make
  ad-hoc schema changes in the Supabase dashboard
- Migrations MUST be written to be reversible where possible; if a migration
  cannot be reversed, this MUST be explicitly noted in the file with rationale
- All write operations that touch multiple tables MUST be transactional
  where the database supports it (e.g., creating an application and
  resume_data record together)
- The `resume_data` table is the single source of truth for all parsed resume
  fields; it MUST NOT be partially written — either the full parse succeeds
  and all fields are stored, or the task fails and retries
- API responses MUST NOT expose internal UUIDs of records the requesting
  user does not own, stack traces, or backend error messages verbatim
- Resume files are stored at `resumes/applications/{hiring_post_id}/{timestamp}_{filename}`;
  candidate photos at `photos/candidates/{timestamp}_{filename}`; deviating
  from this path convention breaks the backend's download logic
- pgvector embeddings are always 384-dimensional; if the embedding model
  changes, a migration MUST update the vector column dimension

### IV. Clear Boundaries

Three layers. Three responsibilities. They do not blur.

**The Next.js Frontend** is a rendering and interaction layer. It fetches data
from Supabase directly (under RLS) for read queries, and calls the FastAPI
backend via `backendFetch` for any operation that involves AI processing,
email dispatch, or complex business logic. It contains no scoring logic,
no AI calls, no email construction. It also has no knowledge of the backend's
physical address — all backend calls go to `/api/proxy/...` and the Next.js
server resolves the actual `BACKEND_URL`.

**The FastAPI Backend** owns all intelligence. Resume scoring, interview
evaluation, job description generation, session management, Celery task
enqueueing, and email dispatch all live here. The backend uses the Supabase
service-role client, which bypasses RLS, because the backend is trusted
server-side infrastructure — it enforces its own authorization logic before
touching the database.

**Supabase** is the single source of truth. PostgreSQL holds all persistent
state. Auth holds all identity state. Storage holds all files. Realtime pushes
change events to connected browsers. No other database or file store is
permitted. The frontend reads from Supabase via the anon client under RLS.
The backend writes to Supabase via the service-role client.

The **Supabase Realtime** subscription pattern is the approved mechanism for
live status updates. The recruiter dashboard, candidate portal, and any other
view that needs to reflect database changes without polling MUST use
`postgres_changes` subscriptions on the relevant table. Polling for status
updates is explicitly prohibited.

Each layer MUST be independently deployable. A backend deployment MUST NOT
require a simultaneous frontend deployment, and vice versa. API contracts
between layers MUST be defined in code (Pydantic models on the backend,
TypeScript interfaces on the frontend) before implementation begins.

### V. Observability

The AI pipeline is a black box unless we instrument it. Recruitment decisions
affect people's livelihoods — when something goes wrong (and it will), we MUST
be able to explain what happened.

- Every API endpoint MUST log: method, path, HTTP status, duration, and
  the authenticated user's ID (never their personal data)
- The `screen_resume_task` Celery task MUST log: application_id, each
  scoring dimension result, the computed overall_score, and the auto-advance
  decision taken, along with the latency of each AI call
- The `evaluate_interview_task` MUST log: session_id, per-question scores,
  the final grade, recommendation, and any LLM errors
- Every OpenAI API call MUST log: model used, prompt token count, completion
  token count, and wall-clock latency
- Every Deepgram and LiveKit operation MUST log: session_id, operation, and
  latency
- Structured JSON logging MUST be used throughout the Python backend via
  the `int.ai` named logger; log lines MUST be parseable by standard log
  aggregation tools
- All errors returned from the backend to clients MUST follow RFC 7807
  Problem Details format: `type`, `title`, `status`, `detail`; stack traces
  MUST NOT appear in API responses

---

## Technology Constraints

The following stack is locked in and production-deployed. Do not introduce
alternatives without documented justification and explicit agreement.

### Frontend
- **Next.js 16.2.2** (App Router, React 19, TypeScript 5, strict mode)
- **`@supabase/ssr` + `@supabase/supabase-js`** — auth and all direct Supabase
  queries from the browser and server components
- **shadcn/ui** (Base UI / Radix primitives) + **Tailwind CSS v4** — all UI
  components; do not reach for other component libraries
- **`@livekit/components-react` + `livekit-client`** — the candidate interview
  room; all LiveKit UI and state management goes through these packages
- **TanStack Table v8** — the candidates table and any other large data table
- **Recharts v3** — all analytics charts
- **`next-themes`** — light/dark mode theming

### Backend
- **Python 3.11+**, **FastAPI**, **Uvicorn** — web framework and server
- **Celery + Redis** — background task queue; Redis is the broker AND result
  backend; do not use another queue system
- **OpenAI SDK (`openai>=2.30.0`)** — GPT-4o-mini for resume scoring,
  interview evaluation, job description generation, question generation,
  and follow-up detection; model upgrades MUST be tested against all scoring
  rubrics before deployment
- **`sentence-transformers`** — 384-dimensional embeddings for resume/JD
  semantic similarity; the model MUST remain consistent across all embeddings
  stored in the database (a model change requires a full re-embedding migration)
- **LiveKit Agents SDK** (`livekit-agents`, `livekit-plugins-deepgram`,
  `livekit-plugins-openai`, `livekit-plugins-silero`) — the AI voice
  interview agent; Deepgram handles STT and TTS; OpenAI handles conversation
  logic; Silero handles voice activity detection
- **`pdfplumber`** — PDF text extraction; **`python-docx`** — DOCX extraction
- **`resend`** — all transactional email: application confirmation, interview
  invitation, rejection, post-interview outcome, team member invitations
- **`supabase` Python client** (service-role key) — all backend database access
- **`ruff`** — linting and formatting; **`pydantic-settings`** — configuration
  from environment variables; **`pydantic`** — all request/response models

### Infrastructure
- **Supabase** — PostgreSQL + pgvector + Auth + Storage + Realtime (single
  source of truth; no other data store permitted)
- **Redis** — Celery broker and result backend
- **LiveKit Cloud** — WebRTC rooms for voice interviews

New dependencies MUST be justified with a documented concrete need. Prefer
packages that are well-maintained and widely adopted. Any package that
introduces a new network dependency (calls an external service) requires
explicit security review before adoption.

---

## AI Pipeline Constraints

The AI pipeline is the core of this product. It must be predictable,
auditable, and honest about its limitations.

**Resume Screening (`screen_resume_task`)**

The task runs four scoring dimensions in parallel via `ThreadPoolExecutor`.
The dimensions and their default weights are:

| Dimension            | Weight |
|----------------------|--------|
| Skill Match          | 35%    |
| Experience Match     | 25%    |
| Embedding Similarity | 20%    |
| Culture Match        | 20%    |

Weights are configurable per `hiring_posts.scoring_weights` and per
`organizations.settings`. The weighted sum is the `overall_score` stored
on the `applications` row.

The auto-advance decision uses `hiring_posts.screening_threshold`:
- `score >= threshold` → `interview_sent`, interview session created,
  invitation email sent
- `threshold - 5% <= score < threshold` → `screened` (recruiter manual review)
- `score < threshold - 5%` → `resume_rejected`, rejection email sent

This task MUST be enqueued asynchronously (never run in-request). It is
triggered automatically by the database trigger in migration 009 on
`applications` INSERT.

**Interview Evaluation (`evaluate_interview_task`)**

Scores each Q&A on four dimensions (0–10 each): technical accuracy, depth
of understanding, communication clarity, relevance to job description.
The weighted average across all questions becomes the `overall_grade` (0–100)
in `interview_reports`.

The recommendation thresholds are:
- `grade >= 70` → `advance` → application status `shortlisted`
- `60 <= grade < 70` → `borderline` → application status `interviewed`
- `grade < 60` → `reject` → application status `interview_rejected`

Candidates with `interview_rejected` status MAY retake the interview. When
the `/interview/my-session` endpoint is called for such a candidate, it
resets the application status to `interview_sent` and resets the most recent
completed session to `pending` (clearing all session state and extending the
deadline by seven days).

**Prompt Governance**

Changes to any AI scoring prompt MUST be tested against a representative set
of real resume/JD pairs to verify that scoring distribution does not shift
unexpectedly before deployment. Prompt changes are not "just text changes" —
they are changes to the scoring model and MUST be treated as such.

---

## System Boundaries and Integration Rules

**Candidate Authentication**

Candidates authenticate via Supabase OTP (magic link / email code). There are
no passwords. The candidate's `auth_user_id` is linked to their `candidates`
row via the `/interview/link-candidate` endpoint, which is called on every
candidate page load. RLS policies on sensitive tables use `auth.uid()` to
scope reads to the authenticated candidate's own records.

**Recruiter Authentication**

Recruiters and admins authenticate via Supabase Auth (email/password or
OAuth). Access to admin routes is gated by the `team_members` table —
a valid Supabase session is not sufficient on its own; the user must also
have an active `team_members` row with an appropriate role for their
organization.

**The Proxy Rule**

All `backendFetch` calls in the frontend resolve to `/api/proxy/{path}`.
The catch-all Next.js route at `app/api/proxy/[...path]/route.ts` forwards
these to `BACKEND_URL` server-side. This rule exists because the backend
runs on a private network in production and its address is not public.
Never bypass this — do not use `NEXT_PUBLIC_BACKEND_URL` for browser-side
calls under any circumstances.

**Realtime Subscriptions**

Any component that needs live updates MUST subscribe to Supabase Realtime
`postgres_changes` on the relevant table with the narrowest possible filter
(e.g., `candidate_id=eq.{id}`). The subscription MUST be cleaned up in the
component's unmount effect. Do not poll.

**Email Dispatch**

All emails are sent via the `resend` SDK from the Python backend. The
following email types exist and MUST NOT be sent from the frontend:
application confirmation, interview invitation (with link + deadline),
resume rejection, post-interview outcome, and team member invitation.
Email templates are constructed in `backend/app/services/email.py`.

---

## Data Model Integrity Rules

The following constraints reflect hard-won design decisions that MUST NOT
be violated silently:

1. `candidates.email` is the globally unique identifier for a candidate
   across all organizations. A candidate who applies to multiple jobs at
   the same company — or at different companies — has one `candidates` row.

2. `applications` is the join between a candidate and a hiring post. One
   candidate may have multiple applications (one per job), but MUST have
   at most one application per `hiring_post_id` (enforced by a unique
   constraint). Duplicate application attempts are rejected with a 409.

3. `resume_data` has a 1:1 relationship with `applications` (unique
   constraint on `application_id`). If a candidate re-applies to the same
   job, the old resume_data MUST be replaced, not duplicated.

4. `interview_sessions` are created per application, not per candidate.
   A candidate who retakes an interview gets a reset session on the same
   application row — not a new application. The session history is
   preserved; only the most recent session's state is reset.

5. `interview_reports` has a 1:1 relationship with `interview_sessions`.
   A report is immutable after creation. Recruiter overrides are stored
   separately (`override_recommendation`, `override_notes`) and do not
   modify the AI-generated report fields.

6. `organizations` is the tenant boundary. All recruiter-facing tables
   (hiring_posts, team_members, interview_templates) are scoped to an
   `org_id`. Cross-organization data leakage is prevented by RLS.

---

## Development Workflow

Features are developed following the specify → plan → tasks → implement
cycle. This is not bureaucracy — it is the difference between building the
right thing and building something that has to be torn out later.

- All schema changes are new, numbered migration files in `supabase/migrations/`;
  existing migrations are immutable once applied
- Frontend MUST pass `pnpm build` (which includes TypeScript type-checking
  in strict mode) before a PR is ready for review
- Backend MUST pass `ruff check` and `ruff format --check` before a PR is
  ready for review
- Tests MUST pass where they exist; new Celery tasks and scoring functions
  MUST have corresponding tests
- Every PR MUST describe what changed, why it changed, and which of the three
  user journeys it affects
- Code review is required before merging to main
- No direct pushes to main; no force pushes to main
- Commits MUST be atomic and descriptive; one logical change per commit

---

## Governance

This constitution is the highest-authority document for the int.ai project.
All plans, PRs, and architectural decisions MUST be evaluated against it.

**Amendments** require documented rationale and explicit agreement. Version
following semver:
- **MAJOR**: Removal or redefinition of a Core Principle
- **MINOR**: New principle, new section, or material expansion of existing content
- **PATCH**: Clarifications, wording fixes, and factual updates

**Conflicts**: When a proposed feature or implementation detail conflicts with
a principle in this document, the principle wins. If a genuine exception is
required, it MUST be documented in the relevant plan's Complexity Tracking
section with a written justification that has been explicitly reviewed.

**Compliance**: Every plan produced for a feature in this codebase MUST
include a constitution check. The three questions are:
1. Does this serve one of the three journeys (Recruiter, Candidate, Admin)?
2. Does it comply with the Security-First and Clear Boundaries principles?
3. Does it preserve Data Integrity — no schema changes outside migrations,
   no broken 1:1 invariants, no cross-org data exposure?

---

**Version**: 2.0.0 | **Ratified**: 2026-04-05 | **Last Amended**: 2026-04-17
