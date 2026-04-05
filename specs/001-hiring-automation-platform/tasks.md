# Tasks: AI-Powered Hiring Automation Platform

**Input**: Design documents from `/specs/001-hiring-automation-platform/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `frontend/` (Next.js App Router)
- **Backend**: `backend/` (FastAPI)
- **Database**: `supabase/` (migrations)

---

## Phase 1: Setup

**Purpose**: Project initialization, dependency installation, base configuration

- [ ] T001 Initialize Next.js 14+ project with TypeScript in frontend/ using `pnpm create next-app`
- [ ] T002 Initialize Python project with pyproject.toml in backend/ with FastAPI, uvicorn, celery, redis, pydantic-settings, gemini, sentence-transformers, pdfplumber, python-docx, livekit-agents, livekit-plugins-deepgram, livekit-plugins-silero, resend dependencies
- [ ] T003 Initialize Supabase project in supabase/ with `npx supabase init` and configure config.toml
- [ ] T004 [P] Install and configure shadcn/ui in frontend/ with Tailwind CSS
- [ ] T005 [P] Install Recharts, TanStack Table, @supabase/ssr, @supabase/supabase-js, livekit-client in frontend/package.json
- [ ] T006 [P] Create backend/app/config.py with Pydantic Settings for all env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, DEEPGRAM_API_KEY, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, REDIS_URL, RESEND_API_KEY)
- [ ] T007 [P] Create backend/.env.example and frontend/.env.example with all required environment variables
- [ ] T008 [P] Create frontend/lib/supabase/client.ts with browser Supabase client using @supabase/ssr
- [ ] T009 [P] Create frontend/lib/supabase/server.ts with Server Component Supabase client using @supabase/ssr and cookies
- [ ] T010 [P] Create frontend/lib/api/backend.ts with typed fetch wrapper for FastAPI backend (base URL from env, JWT forwarding, RFC 7807 error handling)
- [ ] T011 Create frontend/middleware.ts with route protection logic (admin routes require auth, candidate routes require OTP session, apply routes are public)
- [ ] T012 Create frontend/app/layout.tsx with root layout, font loading, and metadata

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, auth, and core infrastructure that MUST be complete before ANY user story

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T013 Create supabase/migrations/001_initial_schema.sql with all tables: organizations, team_members, hiring_posts, candidates, applications, resume_data, interview_templates, interview_sessions, interview_qa, interview_reports — including all constraints, indexes, and foreign keys per data-model.md
- [ ] T014 Create supabase/migrations/002_enable_pgvector.sql enabling the vector extension and adding HNSW index on resume_data.embedding
- [ ] T015 Create supabase/migrations/003_storage_buckets.sql creating resumes, photos, recordings, transcripts buckets with private access policies
- [ ] T016 Create supabase/migrations/004_rls_policies.sql with Row Level Security policies for all tables per RLS Policy Summary in data-model.md (admin, recruiter, hiring_manager, candidate roles)
- [ ] T017 Create supabase/migrations/005_functions.sql with helper functions: auto-close expired hiring posts (pg_cron), generate share_slug, compute weighted overall_score
- [ ] T018 Create supabase/seed.sql with dev data: test organization, admin user, sample interview template presets (backend-engineer, data-scientist, product-manager)
- [ ] T019 Create backend/app/main.py with FastAPI app, CORS middleware (frontend origin), structured JSON logging middleware (request method, path, status, duration), health check endpoint, API router mounting
- [ ] T020 [P] Create backend/app/services/supabase.py with Supabase client wrapper using service role key for backend operations (CRUD helpers, storage signed URLs)
- [ ] T021 [P] Create backend/app/worker.py with Celery app configuration using Redis broker, task autodiscovery from backend/app/tasks/
- [ ] T022 [P] Create backend/app/services/email.py with Resend email service: send_confirmation, send_interview_invitation, send_status_update methods with template rendering
- [ ] T023 [P] Create backend/app/api/email.py with POST /api/v1/email/send endpoint per contracts/api.md
- [ ] T024 Create frontend/app/auth/login/page.tsx with admin login form using Supabase Auth (email + password)
- [ ] T025 Create frontend/app/auth/callback/route.ts with Supabase Auth callback handler for session exchange
- [ ] T026 Create frontend/lib/supabase/middleware.ts with auth helper for Server Components (getUser, getSession, requireRole)
- [ ] T027 Create frontend/app/(admin)/layout.tsx with admin layout: sidebar navigation (Dashboard, Jobs, Candidates, Templates, Analytics, Settings), auth guard checking admin/recruiter role, Supabase Realtime provider

**Checkpoint**: Foundation ready — database deployed, auth working, email service operational. User story implementation can now begin.

---

## Phase 3: User Story 1 — Admin Creates and Publishes a Hiring Post (Priority: P1)

**Goal**: Admin can create a hiring post with all config, publish with deadline, and generate a shareable link

**Independent Test**: Create a post, publish it, verify share link resolves, verify auto-close on deadline

### Implementation for User Story 1

- [ ] T028 [P] [US1] Create backend/app/models/screening.py with Pydantic models: HiringPostCreate, HiringPostUpdate, ScoringWeights, ScreeningConfig
- [ ] T029 [P] [US1] Create frontend/components/ui/ base components via shadcn CLI: Button, Input, Textarea, Select, Badge, Card, Dialog, Form, Label, Tabs, Switch, DatePicker
- [ ] T030 [US1] Create frontend/components/admin/job-form.tsx with multi-step hiring post form: job details (title, department, location, JD rich text, skills tags, experience range, education), screening config (weights sliders, threshold), interview template selector, publish settings (now/scheduled, deadline)
- [ ] T031 [US1] Create frontend/app/(admin)/jobs/page.tsx with jobs list view: table of hiring posts with status badges (draft/published/closed/archived), create new button, search and filter by status
- [ ] T032 [US1] Create frontend/app/(admin)/jobs/new/page.tsx mounting the job-form component for creation
- [ ] T033 [US1] Create frontend/app/(admin)/jobs/[id]/page.tsx with job detail view: edit form, status actions (publish/close/archive), share link display with copy button, application count summary
- [ ] T034 [US1] Create frontend/app/(admin)/dashboard/page.tsx with dashboard home: active hiring posts count, pipeline summary (applications today, interviews pending, shortlisted), recent activity feed
- [ ] T035 [US1] Wire Supabase Realtime subscription on hiring_posts table in jobs list page for live status updates

**Checkpoint**: Admin can create, configure, publish, close, and share hiring posts. Dashboard shows overview.

---

## Phase 4: User Story 2 — Candidate Applies to a Hiring Post (Priority: P1)

**Goal**: Candidate opens share link, fills minimal form, uploads resume/photo, receives confirmation email

**Independent Test**: Open share link, fill form, upload PDF resume, submit, verify confirmation email received

### Implementation for User Story 2

- [ ] T036 [P] [US2] Create frontend/components/shared/file-upload.tsx with drag-and-drop file upload supporting PDF/DOCX (max 5MB), progress indicator, file type validation, direct upload to Supabase Storage
- [ ] T037 [P] [US2] Create frontend/components/candidate/application-form.tsx with candidate application form: full name, email, phone, current role/company, years of experience, location, photo upload, resume upload, submit button
- [ ] T038 [US2] Create frontend/app/apply/[slug]/page.tsx with public application page: fetch hiring post by share_slug, show job title and description, render application-form, handle submission (create candidate if new, create application, upload files, trigger confirmation email via backend API), show success message, handle closed post state
- [ ] T039 [US2] Implement duplicate application detection: before insert, check applications table for existing (hiring_post_id, candidate email) pair, show error message directing to existing portal
- [ ] T040 [US2] Create backend/app/api/webhooks.py with POST /api/v1/webhooks/application-created endpoint: receives Supabase database webhook on applications INSERT, calls screening trigger

**Checkpoint**: Candidates can apply via share link. Files stored in Supabase Storage. Confirmation email sent. Duplicates rejected.

---

## Phase 5: User Story 3 — Automated Resume Screening and Ranking (Priority: P1)

**Goal**: Resume parsed to markdown, three-layer scoring, candidate table populated, auto-advance/reject

**Independent Test**: Submit a resume, verify parsed fields + all 4 scores appear in candidate table within 5 min, verify threshold-based auto-advance

### Implementation for User Story 3

- [ ] T041 [P] [US3] Create backend/app/services/resume_parser.py with PDF/DOCX text extraction (pdfplumber + python-docx) and LLM-based structured extraction to markdown and normalized fields using Claude JSON mode (parsed_name, parsed_email, parsed_education, parsed_experience, parsed_skills, parsed_projects, parsed_certifications, parsed_summary)
- [ ] T042 [P] [US3] Create backend/app/services/embeddings.py with sentence-transformers all-MiniLM-L6-v2 model loading, embed_text function returning 384-dim vector, cosine similarity computation, pgvector storage/query via Supabase
- [ ] T043 [US3] Create backend/app/services/scoring.py with three-layer scoring pipeline: embed_and_score (embedding similarity between resume and JD), llm_skill_match (per-skill evaluation with confidence via Claude JSON mode), llm_experience_match (seniority alignment, complexity, domain relevance), llm_culture_match (collaboration signals, initiative indicators). Each returns 0.0-1.0 score + details JSON. compute_overall applies admin-configured weights.
- [ ] T044 [US3] Create backend/app/tasks/screen_resume.py with Celery task: download resume from Supabase Storage, parse (resume_parser), embed (embeddings), score all three layers (scoring), store results in resume_data + application tables, run auto-advance logic (above threshold → interview_sent + send invitation email, below → rejected, borderline → flagged for review), update application status
- [ ] T045 [US3] Create backend/app/api/screening.py with POST /api/v1/screening/trigger and GET /api/v1/screening/status/{task_id} endpoints per contracts/api.md
- [ ] T046 [P] [US3] Create frontend/components/admin/candidate-table.tsx with TanStack Table: columns for name, email, current role, experience, education, key skills, embedding score, skill match %, experience match %, culture match %, overall score %, status badge. Sortable columns, text search, status filter, bulk select with actions (advance, reject, send interview)
- [ ] T047 [US3] Create frontend/app/(admin)/jobs/[id]/candidates/page.tsx mounting candidate-table filtered by hiring_post_id, with Supabase Realtime subscription for live score updates as screening completes
- [ ] T048 [US3] Create frontend/app/(admin)/candidates/page.tsx with all-candidates view across all jobs, searchable and filterable

**Checkpoint**: Full screening pipeline operational. Candidate table shows parsed data + scores. Auto-advance sends interview invitations.

---

## Phase 6: User Story 4 — AI Voice Interview (Priority: P1)

**Goal**: Candidate authenticates via OTP, completes pre-interview checklist, conducts live AI voice interview via LiveKit

**Independent Test**: Receive invitation, OTP login, mic check, consent, start interview, have 2-3 Q&A exchanges, verify <2s latency, session ends with confirmation

### Implementation for User Story 4

- [ ] T049 [P] [US4] Create backend/app/interview/question_gen.py with dynamic question generator: takes resume markdown + JD + conversation history, generates next question split between foundational (validate claimed skills deeply) and project-based (deep-dive into specific projects), tracks question count and topic coverage, outputs question text + type + topic
- [ ] T050 [P] [US4] Create backend/app/interview/agent.py with LiveKit VoicePipelineAgent setup: configure Deepgram Nova-2 STT (en-IN language, streaming), Deepgram TTS (streaming), Claude Sonnet LLM with system prompt (professional interviewer persona, resume + JD context, adaptive follow-up logic), allow_interruption=True for barge-in, session boundary enforcement (max questions, max duration)
- [ ] T051 [US4] Implement interview session lifecycle in backend/app/interview/agent.py: on_session_start (load resume + JD from Supabase, initialize conversation), on_user_speech (evaluate answer, decide follow-up vs next question via question_gen), on_session_end (natural wrap-up, store session metadata, trigger evaluation), reconnection support (store state in Redis, reconnect within 5-min window)
- [ ] T052 [US4] Create backend/app/api/interview.py with POST /api/v1/interview/create-room (create LiveKit room, generate candidate token, create interview_session record), POST /api/v1/interview/reconnect (validate reconnection_token, generate new token), POST /api/v1/interview/evaluate (enqueue evaluation task) per contracts/api.md
- [ ] T053 [P] [US4] Create backend/app/models/interview.py with Pydantic models: CreateRoomRequest, CreateRoomResponse, ReconnectRequest, ReconnectResponse, EvaluateRequest
- [ ] T054 [P] [US4] Create frontend/components/candidate/interview-checklist.tsx with pre-interview page: browser/mic permission check with status indicators, consent acknowledgment checkbox with timestamp logging, interview format explainer text, "Start Interview" button (enabled only when all checks pass)
- [ ] T055 [US4] Create frontend/components/candidate/interview-room.tsx with live interview UI: LiveKit room connection using livekit-client, audio visualization (speaking indicator for AI and candidate), question count progress (e.g., "Question 3 of 10"), elapsed time display, connection status indicator, graceful disconnect handling with reconnection prompt
- [ ] T056 [US4] Create frontend/app/(candidate)/interview/page.tsx with pre-interview checklist page: fetch interview session details, verify time window not expired, render interview-checklist, on consent submit → call create-room API
- [ ] T057 [US4] Create frontend/app/(candidate)/interview/session/page.tsx with live interview session page: connect to LiveKit room using candidate token, render interview-room component, handle session end → redirect to completion confirmation page
- [ ] T058 [US4] Create frontend/app/(candidate)/layout.tsx with candidate portal layout: minimal header with int.ai branding, OTP auth guard (redirect to OTP login if no session), candidate-specific navigation

**Checkpoint**: Full voice interview pipeline works end-to-end. Candidate can authenticate, consent, interview with AI, and receive completion confirmation.

---

## Phase 7: User Story 5 — Interview Evaluation and Reporting (Priority: P2)

**Goal**: Auto-evaluate each answer on 4 dimensions, generate overall grade + AI summary, display report on dashboard

**Independent Test**: After an interview completes, verify report appears with per-question scores, transcript, audio playback, and AI recommendation

### Implementation for User Story 5

- [ ] T059 [US5] Create backend/app/interview/evaluator.py with post-interview evaluation: load transcript from Deepgram, split into Q&A pairs, for each answer evaluate via Claude on 4 dimensions (technical_accuracy, depth_of_understanding, communication_clarity, relevance_to_jd) returning 0-10 scores + rationale, compute overall grade (weighted aggregate normalized to 0-100), generate AI summary (3-5 sentences: strengths, concerns, fit assessment), determine recommendation (advance/borderline/reject)
- [ ] T060 [US5] Create backend/app/tasks/evaluate_interview.py with Celery task: fetch interview session, download recording + transcript from Supabase Storage, run evaluator, store InterviewQA records + InterviewReport, update application decision field, generate share_token for hiring manager access
- [ ] T061 [P] [US5] Create frontend/components/shared/audio-player.tsx with audio playback component: play/pause, seek bar, playback speed control, timestamp display
- [ ] T062 [P] [US5] Create frontend/components/shared/score-radar.tsx with Recharts radar chart component: displays 4 interview dimensions (technical accuracy, depth, communication, relevance) for one or more candidates
- [ ] T063 [US5] Create frontend/components/admin/interview-report.tsx with full interview report view: overall grade (0-100) with color indicator, AI recommendation badge (Advance/Borderline/Reject), AI summary paragraph, per-question accordion (question text, answer transcript, 4 dimension scores with bars, score rationale), full transcript with timestamps, audio player, recruiter notes input, override recommendation dropdown
- [ ] T064 [US5] Create frontend/app/(admin)/candidates/[id]/page.tsx with candidate detail page: tabs for Profile (parsed resume, application details, screening scores), Interview Report (interview-report component), and Notes (recruiter notes + override history)

**Checkpoint**: Interview evaluation is fully automated. Recruiter sees complete report with actionable recommendation.

---

## Phase 8: User Story 6 — Candidate Portal with Status Tracking (Priority: P2)

**Goal**: Candidate logs in via OTP, sees real-time application status, receives email notifications on changes

**Independent Test**: Candidate logs in, sees current status, status changes trigger email notification and portal update

### Implementation for User Story 6

- [ ] T065 [P] [US6] Create frontend/components/candidate/status-tracker.tsx with visual status pipeline: Applied → Screening Complete → Interview Invited → Interview Complete → Decision Pending → Outcome. Current step highlighted, completed steps checked, upcoming steps grayed out
- [ ] T066 [US6] Create frontend/app/(candidate)/portal/page.tsx with candidate portal home: OTP login flow (enter email → receive OTP → verify), after auth show role applied for, current status via status-tracker, interview access button (if invited and within window), application timestamp
- [ ] T067 [US6] Wire Supabase Realtime subscription on applications table (filtered by candidate_id) in portal page for live status updates
- [ ] T068 [US6] Implement status change email notifications in backend: add a Supabase database webhook on applications.status UPDATE that calls POST /api/v1/email/send with status_update template, candidate email, and new status

**Checkpoint**: Candidate portal operational with real-time status tracking and email notifications.

---

## Phase 9: User Story 7 — Candidate Comparison (Priority: P2)

**Goal**: Recruiter selects 2-4 candidates and views side-by-side comparison

**Independent Test**: Select 3 candidates, click Compare, verify radar charts, skill overlap, and experience timelines render correctly

### Implementation for User Story 7

- [ ] T069 [US7] Create frontend/components/admin/comparison-view.tsx with side-by-side comparison layout: score radar chart (shared score-radar component) for each candidate, skill overlap Venn/matrix visualization, experience timeline (Recharts horizontal bar chart showing career progression), AI summary side-by-side, overall score comparison bar chart
- [ ] T070 [US7] Create frontend/app/(admin)/candidates/compare/page.tsx with comparison page: receive candidate IDs via query params, fetch all candidate data + interview reports, render comparison-view, allow adding/removing candidates (2-4 range)
- [ ] T071 [US7] Add multi-select checkboxes and "Compare Selected" button to candidate-table.tsx (T046), navigating to compare page with selected candidate IDs

**Checkpoint**: Recruiters can visually compare candidates side-by-side for shortlisting decisions.

---

## Phase 10: User Story 9 — Interview Template Management (Priority: P2)

**Goal**: Admin creates, edits, clones, and manages interview templates with configurable parameters

**Independent Test**: Create a template with custom config, clone it, edit the clone, assign to a hiring post

### Implementation for User Story 9

- [ ] T072 [P] [US9] Create frontend/components/admin/template-form.tsx with interview template form: name, max questions (slider 5-15), max duration (slider 15-60 min), foundational/project ratio slider, scoring weights (4 sliders summing to 1.0), must-ask topics (tag input), role preset selector
- [ ] T073 [US9] Create frontend/app/(admin)/templates/page.tsx with template list: table showing name, question count, duration, preset badge, usage count, actions (edit, clone, delete). Create new button. Clone action creates copy with "(Copy)" suffix
- [ ] T074 [US9] Create frontend/app/(admin)/templates/[id]/page.tsx with template edit page mounting template-form with existing data, save and delete actions

**Checkpoint**: Interview templates are fully manageable. Admins can customize interview parameters per role.

---

## Phase 11: User Story 8 — Analytics Dashboard (Priority: P3)

**Goal**: Funnel visualization, conversion rates, timing metrics, score distributions, CSV/PDF export

**Independent Test**: With candidates at various stages, verify funnel chart, conversion rates, and CSV export work correctly

### Implementation for User Story 8

- [ ] T075 [P] [US8] Create frontend/components/admin/analytics-charts.tsx with Recharts visualizations: funnel chart (applied → screened → interviewed → shortlisted → hired with counts and conversion rates), timing metrics cards (avg time-to-screen, avg time-to-interview), score distribution histogram, pass rate donut chart
- [ ] T076 [US8] Create frontend/app/(admin)/analytics/page.tsx with analytics dashboard: job selector filter, date range picker, render analytics-charts, CSV export button (client-side CSV generation from displayed data), PDF export button (browser print-to-PDF)
- [ ] T077 [US8] Implement analytics data queries: Supabase aggregation queries for funnel counts by status, avg timestamps between status transitions, score distribution buckets per hiring post

**Checkpoint**: Analytics dashboard provides actionable hiring funnel insights with export capabilities.

---

## Phase 12: User Story 10 — Team Management and Settings (Priority: P3)

**Goal**: Admin invites team members, assigns roles and jobs, configures org-wide settings

**Independent Test**: Invite a recruiter, assign to 2 jobs, verify recruiter sees only assigned jobs

### Implementation for User Story 10

- [ ] T078 [P] [US10] Create frontend/app/(admin)/settings/page.tsx with settings page: tabs for Team, Email Templates, Defaults, Data Retention
- [ ] T079 [US10] Implement Team tab in settings: team member table (name, email, role, status, assigned jobs), invite form (email + role selector), edit role, deactivate member. Invite sends email via backend API
- [ ] T080 [US10] Implement Defaults tab: default scoring weights sliders, default screening threshold, default interview template selector
- [ ] T081 [US10] Implement Data Retention tab: retention period selector (30/60/90/180/365 days), explanation text, save to organization settings

**Checkpoint**: Multi-user team management operational. Role-based access enforced end-to-end.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T082 [P] Create shared loading states and skeleton components in frontend/components/shared/
- [ ] T083 [P] Add error boundaries and user-friendly error pages (404, 500, unauthorized) in frontend/app/
- [ ] T084 [P] Implement structured logging for all backend AI calls in backend/app/services/ (token usage, latency, model name per constitution V. Observability)
- [ ] T085 [P] Add input validation on all backend API endpoints using Pydantic models (file type, file size, email format, UUID format per constitution I. Security-First)
- [ ] T086 Add responsive design for candidate-facing pages (apply form, portal, interview) in frontend/components/candidate/
- [ ] T087 Create shareable report link flow: generate time-limited share_token in interview report, create frontend/app/report/[token]/page.tsx with public read-only report view (no auth required, expires after 7 days)
- [ ] T088 Run quickstart.md validation: verify all setup steps work on a clean machine, fix any missing steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on Foundational + US1 (needs hiring posts to exist)
- **US3 (Phase 5)**: Depends on US2 (needs applications to screen)
- **US4 (Phase 6)**: Depends on US3 (needs screened candidates with invitations)
- **US5 (Phase 7)**: Depends on US4 (needs completed interviews to evaluate)
- **US6 (Phase 8)**: Depends on Foundational (independent of other stories)
- **US7 (Phase 9)**: Depends on US5 (needs evaluated candidates to compare)
- **US9 (Phase 10)**: Depends on Foundational (independent, but enhance US1 and US4)
- **US8 (Phase 11)**: Depends on US3 (needs pipeline data for analytics)
- **US10 (Phase 12)**: Depends on Foundational (independent)
- **Polish (Phase 13)**: Depends on all desired user stories being complete

### Critical Path (P1 Stories)

```
Setup → Foundational → US1 → US2 → US3 → US4
```

### Parallel Opportunities (after Foundational)

```
Track A (critical path): US1 → US2 → US3 → US4 → US5 → US7
Track B (independent):   US6 (candidate portal)
Track C (independent):   US9 (interview templates)
Track D (independent):   US10 (team management)
Track E (after US3):     US8 (analytics)
```

### Within Each User Story

- Models before services
- Services before endpoints/API
- Backend before frontend (API must exist for frontend to call)
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities Within Phases

```bash
# Phase 1 — all [P] tasks can run in parallel:
T004, T005, T006, T007, T008, T009, T010

# Phase 2 — after T013-T018 (DB):
T019 (backend main), then T020, T021, T022, T023 in parallel
T024, T025, T026 in parallel (frontend auth)

# Phase 5 (US3) — models + services in parallel:
T041 (resume parser), T042 (embeddings) in parallel
Then T043 (scoring, depends on both)
T046 (frontend table) can start in parallel with backend work
```

---

## Implementation Strategy

### MVP First (User Stories 1-4)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: US1 — Admin creates hiring posts
4. Complete Phase 4: US2 — Candidate applies
5. Complete Phase 5: US3 — Automated screening
6. Complete Phase 6: US4 — AI voice interview
7. **STOP and VALIDATE**: Test full pipeline end-to-end
8. Deploy MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Admin can create and share jobs (Demo 1)
3. US2 → Candidates can apply (Demo 2)
4. US3 → Automated screening with scores (Demo 3 — major milestone)
5. US4 → AI interviews working (Demo 4 — MVP complete)
6. US5 → Evaluation reports (Demo 5)
7. US6 + US9 → Candidate portal + Templates (Demo 6)
8. US7 + US8 + US10 → Comparison, Analytics, Team (Demo 7 — full platform)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The critical path (US1→US2→US3→US4) must be sequential; P2/P3 stories can parallelize
