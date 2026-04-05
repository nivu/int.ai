-- 001_initial_schema.sql
-- Core tables for the int.ai hiring platform

-- Enable pgvector extension first (required for embedding column)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================
-- 1. organizations
-- ============================================================
CREATE TABLE organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text UNIQUE NOT NULL,
    settings    jsonb DEFAULT '{}',
    data_retention_days integer DEFAULT 365,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 2. team_members
-- ============================================================
CREATE TABLE team_members (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id),
    user_id     uuid NOT NULL REFERENCES auth.users(id),
    role        text NOT NULL CHECK (role IN ('admin', 'recruiter', 'hiring_manager')),
    invited_by  uuid REFERENCES team_members(id),
    status      text DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'deactivated')),
    created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 3. interview_templates
-- ============================================================
CREATE TABLE interview_templates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              uuid NOT NULL REFERENCES organizations(id),
    name                text NOT NULL,
    max_questions       integer DEFAULT 10,
    max_duration_minutes integer DEFAULT 45,
    foundational_ratio  real DEFAULT 0.6,
    scoring_weights     jsonb DEFAULT '{"technical": 0.3, "depth": 0.25, "communication": 0.2, "relevance": 0.25}',
    must_ask_topics     text[],
    is_preset           boolean DEFAULT false,
    preset_role         text,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

-- ============================================================
-- 4. hiring_posts
-- ============================================================
CREATE TABLE hiring_posts (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  uuid NOT NULL REFERENCES organizations(id),
    created_by              uuid NOT NULL REFERENCES team_members(id),
    title                   text NOT NULL,
    department              text,
    location_type           text CHECK (location_type IN ('remote', 'onsite', 'hybrid')),
    location                text,
    description             text NOT NULL,
    required_skills         text[],
    experience_min          integer,
    experience_max          integer,
    education_requirements  text,
    scoring_weights         jsonb NOT NULL,
    screening_threshold     integer DEFAULT 70,
    interview_template_id   uuid REFERENCES interview_templates(id),
    status                  text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
    published_at            timestamptz,
    closes_at               timestamptz,
    share_slug              text UNIQUE,
    created_at              timestamptz DEFAULT now(),
    updated_at              timestamptz DEFAULT now()
);

-- ============================================================
-- 5. candidates
-- ============================================================
CREATE TABLE candidates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL,
    full_name       text NOT NULL,
    phone           text,
    "current_role"    text,
    current_company text,
    years_experience integer,
    location        text,
    photo_url       text,
    auth_user_id    uuid REFERENCES auth.users(id),
    created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_candidates_email ON candidates(email);

-- ============================================================
-- 6. applications
-- ============================================================
CREATE TABLE applications (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hiring_post_id          uuid NOT NULL REFERENCES hiring_posts(id),
    candidate_id            uuid NOT NULL REFERENCES candidates(id),
    resume_url              text NOT NULL,
    resume_filename         text NOT NULL,
    status                  text DEFAULT 'applied',
    embedding_score         real,
    skill_match_score       real,
    experience_match_score  real,
    culture_match_score     real,
    overall_score           real,
    screening_completed_at  timestamptz,
    interview_invited_at    timestamptz,
    interview_deadline      timestamptz,
    decision                text CHECK (decision IN ('advance', 'borderline', 'reject')),
    recruiter_override      text,
    recruiter_notes         text,
    created_at              timestamptz DEFAULT now(),
    updated_at              timestamptz DEFAULT now(),
    UNIQUE (hiring_post_id, candidate_id)
);

-- ============================================================
-- 7. resume_data
-- ============================================================
CREATE TABLE resume_data (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id          uuid UNIQUE NOT NULL REFERENCES applications(id),
    raw_markdown            text NOT NULL,
    parsed_name             text,
    parsed_email            text,
    parsed_education        jsonb,
    parsed_experience       jsonb,
    parsed_skills           text[],
    parsed_projects         jsonb,
    parsed_certifications   text[],
    parsed_summary          text,
    embedding               extensions.vector(384),
    skill_match_details     jsonb,
    experience_match_details jsonb,
    culture_match_details   jsonb,
    parsing_error           text,
    created_at              timestamptz DEFAULT now()
);

-- ============================================================
-- 8. interview_sessions
-- ============================================================
CREATE TABLE interview_sessions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id          uuid UNIQUE NOT NULL REFERENCES applications(id),
    template_id             uuid NOT NULL REFERENCES interview_templates(id),
    livekit_room_name       text,
    status                  text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'disconnected', 'expired')),
    started_at              timestamptz,
    ended_at                timestamptz,
    duration_seconds        integer,
    questions_asked         integer DEFAULT 0,
    recording_url           text,
    transcript_url          text,
    consent_given_at        timestamptz NOT NULL,
    reconnection_token      text,
    reconnection_expires_at timestamptz,
    created_at              timestamptz DEFAULT now()
);

-- ============================================================
-- 9. interview_qa
-- ============================================================
CREATE TABLE interview_qa (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id              uuid NOT NULL REFERENCES interview_sessions(id),
    question_number         integer NOT NULL,
    question_type           text CHECK (question_type IN ('foundational', 'project')),
    question_text           text NOT NULL,
    answer_text             text,
    answer_start_ts         real,
    answer_end_ts           real,
    technical_accuracy      real,
    depth_of_understanding  real,
    communication_clarity   real,
    relevance_to_jd         real,
    score_rationale         text,
    created_at              timestamptz DEFAULT now()
);

-- ============================================================
-- 10. interview_reports
-- ============================================================
CREATE TABLE interview_reports (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          uuid UNIQUE NOT NULL REFERENCES interview_sessions(id),
    overall_grade       real NOT NULL,
    recommendation      text CHECK (recommendation IN ('advance', 'borderline', 'reject')),
    summary             text NOT NULL,
    strengths           text[],
    concerns            text[],
    share_token         text UNIQUE,
    share_expires_at    timestamptz,
    created_at          timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_applications_post_score ON applications(hiring_post_id, overall_score DESC);
CREATE INDEX idx_applications_post_status ON applications(hiring_post_id, status);
CREATE INDEX idx_applications_candidate ON applications(candidate_id);
CREATE INDEX idx_hiring_posts_org_status ON hiring_posts(org_id, status);
CREATE INDEX idx_interview_sessions_application ON interview_sessions(application_id);
