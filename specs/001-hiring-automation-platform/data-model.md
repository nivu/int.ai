# Data Model: AI-Powered Hiring Automation Platform

**Branch**: `001-hiring-automation-platform`
**Date**: 2026-04-05
**Storage**: Supabase PostgreSQL + pgvector + Supabase Storage

## Entity Relationship Overview

```
Organization 1──* TeamMember
Organization 1──* HiringPost
HiringPost   1──* Application
HiringPost   *──1 InterviewTemplate
Candidate    1──* Application
Application  1──1 ResumeData
Application  1──0..1 InterviewSession
InterviewSession 1──1 InterviewReport
InterviewSession 1──* InterviewQA
```

## Entities

### Organization

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| name | text | NOT NULL | Company name |
| slug | text | UNIQUE, NOT NULL | URL-friendly identifier |
| settings | jsonb | DEFAULT '{}' | Default thresholds, scoring weights, email templates |
| data_retention_days | integer | DEFAULT 365 | Auto-delete after N days post-decision |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

### TeamMember

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| org_id | uuid | FK → Organization, NOT NULL | |
| user_id | uuid | FK → auth.users, NOT NULL | Supabase Auth user |
| role | text | NOT NULL, CHECK (admin/recruiter/hiring_manager) | |
| invited_by | uuid | FK → TeamMember | |
| status | text | DEFAULT 'invited', CHECK (invited/active/deactivated) | |
| created_at | timestamptz | DEFAULT now() | |

**RLS**: Members see only their own org. Admins can manage members.
Recruiters see only assigned jobs.

**Note**: No name or email is stored here. The login email lives on
`auth.users`; Settings → Team reads it through `GET /api/v1/team`, which
resolves it with the service-role client.

### ApiKey

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| org_id | uuid | FK → Organization, NOT NULL | |
| team_member_id | uuid | FK → TeamMember, NOT NULL | The member the key acts as |
| name | text | NOT NULL | Label chosen at creation |
| key_prefix | text | NOT NULL | Non-secret display prefix (`intai_` + 6 chars) |
| key_hash | text | NOT NULL, UNIQUE | SHA-256 of the raw key; the raw key is never stored |
| created_at | timestamptz | DEFAULT now() | |
| last_used_at | timestamptz | | Updated on each successful MCP auth |
| revoked_at | timestamptz | | Soft delete; a revoked key is refused immediately |

**RLS**: Enabled with no policies. Only the backend's service-role client
reads or writes this table (MCP auth in `app/mcp/auth.py`, management in
`/api/v1/api-keys`). Added by migration 025.

### HiringPost

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| org_id | uuid | FK → Organization, NOT NULL | |
| created_by | uuid | FK → TeamMember, NOT NULL | |
| title | text | NOT NULL | Job title |
| department | text | | |
| location_type | text | CHECK (remote/onsite/hybrid) | |
| location | text | | City/region |
| description | text | NOT NULL | Rich text JD |
| required_skills | text[] | | Tag array |
| experience_min | integer | | Years |
| experience_max | integer | | Years |
| education_requirements | text | | |
| scoring_weights | jsonb | NOT NULL | `{skill_match, experience_match, culture_match, embedding_similarity}`; defaults 0.4 / 0.35 / 0.25 / 0.2. Relative weights: the overall score divides by their total, so they need not sum to 1. All four are shown on the job form |
| screening_threshold | integer | DEFAULT 70 | Percentage for auto-advance |
| interview_template_id | uuid | FK → InterviewTemplate | |
| status | text | DEFAULT 'draft', CHECK (draft/published/closed/archived) | |
| published_at | timestamptz | | |
| closes_at | timestamptz | | Auto-close deadline |
| share_slug | text | UNIQUE | For shareable application link |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

**State transitions**: draft → published → closed → archived.
Trigger: auto-close when `closes_at` passes (Supabase pg_cron or
backend scheduled task).

### Candidate

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| email | text | NOT NULL | Unique per candidate across posts |
| full_name | text | NOT NULL | |
| phone | text | | |
| current_role | text | | |
| current_company | text | | |
| years_experience | integer | | |
| location | text | | |
| linkedin_url | text | | Required on the public apply form (migration 024); existing rows backfilled from resume text where a `linkedin.com/in/…` link was found |
| photo_url | text | | Supabase Storage path |
| auth_user_id | uuid | FK → auth.users | Created on first OTP login |
| created_at | timestamptz | DEFAULT now() | |

**Note**: Candidate is deduplicated by email. One candidate can have
multiple applications across different hiring posts.

### Application

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| hiring_post_id | uuid | FK → HiringPost, NOT NULL | |
| candidate_id | uuid | FK → Candidate, NOT NULL | |
| resume_url | text | NOT NULL | Supabase Storage path |
| resume_filename | text | NOT NULL | Original filename |
| status | text | DEFAULT 'applied' | See status enum below |
| embedding_score | real | | 0.0-1.0 |
| skill_match_score | real | | 0.0-1.0 |
| experience_match_score | real | | 0.0-1.0 |
| culture_match_score | real | | 0.0-1.0 |
| overall_score | real | | Weighted aggregate 0.0-1.0 |
| screening_completed_at | timestamptz | | |
| screening_error | text | | Last screening failure message (migration 027); kept after a successful retry |
| screening_failed_at | timestamptz | | When screening last failed (migration 027) |
| interview_invited_at | timestamptz | | |
| interview_deadline | timestamptz | | Window to complete interview |
| decision | text | CHECK (advance/borderline/reject) | Final AI recommendation |
| recruiter_override | text | | Manual override of AI decision |
| recruiter_notes | text | | |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

**UNIQUE**: (hiring_post_id, candidate_id) — prevents duplicate apps.

**Status enum**: applied → screening → screened → interview_sent →
interview_in_progress → interviewed → shortlisted → rejected → archived.

### ResumeData

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| application_id | uuid | FK → Application, UNIQUE, NOT NULL | |
| raw_markdown | text | NOT NULL | Full resume as markdown |
| parsed_name | text | | |
| parsed_email | text | | |
| parsed_education | jsonb | | Array of {institution, degree, year} |
| parsed_experience | jsonb | | Array of {company, role, duration, description} |
| parsed_skills | text[] | | Normalized skill tags |
| parsed_projects | jsonb | | Array of {name, description, tech} |
| parsed_certifications | text[] | | |
| parsed_summary | text | | |
| embedding | vector(384) | | all-MiniLM-L6-v2 output (pgvector) |
| skill_match_details | jsonb | | Per-skill breakdown from LLM |
| experience_match_details | jsonb | | LLM rationale |
| culture_match_details | jsonb | | LLM rationale |
| parsing_error | text | | NULL if successful |
| created_at | timestamptz | DEFAULT now() | |

### InterviewTemplate

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| org_id | uuid | FK → Organization, NOT NULL | |
| name | text | NOT NULL | |
| max_questions | integer | DEFAULT 10 | |
| max_duration_minutes | integer | DEFAULT 45 | |
| foundational_ratio | real | DEFAULT 0.6 | 60% foundational, 40% project |
| scoring_weights | jsonb | DEFAULT '{"technical": 0.3, "depth": 0.25, "communication": 0.2, "relevance": 0.25}' | |
| must_ask_topics | text[] | | Topics AI must cover |
| is_preset | boolean | DEFAULT false | Role presets |
| preset_role | text | | e.g., "backend-engineer", "data-scientist" |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

### InterviewSession

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| application_id | uuid | FK → Application, UNIQUE, NOT NULL | |
| template_id | uuid | FK → InterviewTemplate, NOT NULL | |
| livekit_room_name | text | | LiveKit room identifier |
| status | text | DEFAULT 'pending' | pending/in_progress/completed/disconnected/expired |
| started_at | timestamptz | | |
| ended_at | timestamptz | | |
| duration_seconds | integer | | |
| questions_asked | integer | DEFAULT 0 | |
| recording_url | text | | Supabase Storage path |
| transcript_url | text | | Supabase Storage path |
| consent_given_at | timestamptz | NOT NULL | Audit: candidate consented |
| reconnection_token | text | | For 5-min reconnect window |
| reconnection_expires_at | timestamptz | | |
| created_at | timestamptz | DEFAULT now() | |

### InterviewQA

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| session_id | uuid | FK → InterviewSession, NOT NULL | |
| question_number | integer | NOT NULL | 1-based order |
| question_type | text | CHECK (foundational/project) | |
| question_text | text | NOT NULL | |
| answer_text | text | | Transcribed answer |
| answer_start_ts | real | | Seconds from session start |
| answer_end_ts | real | | |
| technical_accuracy | real | | 0-10 |
| depth_of_understanding | real | | 0-10 |
| communication_clarity | real | | 0-10 |
| relevance_to_jd | real | | 0-10 |
| score_rationale | text | | LLM explanation |
| created_at | timestamptz | DEFAULT now() | |

### InterviewReport

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| session_id | uuid | FK → InterviewSession, UNIQUE, NOT NULL | |
| overall_grade | real | NOT NULL | 0-100 |
| recommendation | text | CHECK (advance/borderline/reject) | |
| summary | text | NOT NULL | 3-5 sentence AI narrative |
| strengths | text[] | | Key strengths identified |
| concerns | text[] | | Key concerns identified |
| share_token | text | UNIQUE | For time-limited sharing with hiring managers |
| share_expires_at | timestamptz | | Default 7 days |
| created_at | timestamptz | DEFAULT now() | |

### AiUsage

One row per billable AI or voice call. Written only by the backend
(`app/services/usage.py`); the browser never touches it. Added by migration
026.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | |
| org_id | uuid | FK → Organization | Null for calls with no org context |
| hiring_post_id | uuid | FK → HiringPost | |
| application_id | uuid | FK → Application | |
| interview_session_id | uuid | FK → InterviewSession | |
| provider | text | NOT NULL | `openai`, `deepgram`, `livekit` |
| model | text | NOT NULL | e.g. `gpt-4o-mini`, `o1-mini`, `nova-2`, `aura-luna-en`, `agent-session` |
| operation | text | NOT NULL | `parse_resume`, `score_resume`, `embed_resume`, `generate_job_description`, `interview_question`, `interview_llm`, `interview_stt`, `interview_tts`, `interview_session`, `interview_summary`, `evaluate:<step>` |
| input_tokens / output_tokens | integer | DEFAULT 0 | LLM and embedding tokens |
| duration_seconds | real | DEFAULT 0 | Audio seconds (STT/TTS) or session seconds (LiveKit) |
| characters | integer | DEFAULT 0 | TTS characters |
| cost_usd | numeric(12,6) | DEFAULT 0 | Estimated at write time from the price table in `usage.py` |
| latency_ms | real | | |
| status | text | DEFAULT 'success' | `success` or `error` |
| error | text | | First 500 chars of the failure |
| created_at | timestamptz | DEFAULT now() | |

**RLS**: Enabled with no policies (service role only).

## Indexes

- `application(hiring_post_id, overall_score DESC)` — candidate ranking
- `application(hiring_post_id, status)` — pipeline filtering
- `application(candidate_id)` — candidate portal lookups
- `candidate(email)` — UNIQUE, duplicate detection
- `hiring_post(org_id, status)` — dashboard listing
- `hiring_post(share_slug)` — UNIQUE, application link resolution
- `resume_data(embedding)` — HNSW index for pgvector similarity search
- `interview_session(application_id)` — session lookup

## Supabase Storage Buckets

| Bucket | Access | Contents |
|--------|--------|----------|
| `resumes` | Private (RLS) | PDF/DOCX uploads |
| `photos` | Private (RLS) | Candidate profile photos |
| `recordings` | Private (RLS) | Interview audio recordings |
| `transcripts` | Private (RLS) | Interview transcripts |

## RLS Policy Summary

| Table | Admin | Recruiter | Hiring Manager | Candidate |
|-------|-------|-----------|----------------|-----------|
| Organization | Own org: full | Own org: read | None | None |
| TeamMember | Own org: full | Own org: read self | None | None |
| HiringPost | Own org: full | Assigned posts: read | None | Published: read (via share_slug) |
| Candidate | Own org apps: read | Assigned posts: read | None | Self: read |
| Application | Own org: full | Assigned posts: read/update | Shared reports: read | Self: read |
| ResumeData | Own org: read | Assigned posts: read | None | None |
| InterviewSession | Own org: read | Assigned posts: read | Shared: read | Self: read/update |
| InterviewQA | Own org: read | Assigned posts: read | Shared: read | None |
| InterviewReport | Own org: read | Assigned posts: read | Via share_token: read | None |
