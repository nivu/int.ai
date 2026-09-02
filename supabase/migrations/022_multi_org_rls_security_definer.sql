-- 022_multi_org_rls_security_definer.sql
--
-- ⚠️  NEEDS REVIEW BEFORE APPLYING TO PRODUCTION.
--
-- This migration captures schema changes that were applied by hand in the
-- Supabase SQL editor on 2026-07-04 and were never committed as migrations.
-- Production already has this state; a clean database does NOT. Without this
-- file, `supabase db push` against a fresh database rebuilds the *broken*
-- pre-incident state, because migration 008 still creates the duplicate-session
-- trigger that was dropped manually in production.
--
-- Every statement is written to be idempotent so applying it to production
-- should be a no-op. Verify that claim against a staging copy first.
--
-- Spec: specs/002-multi-org-isolation/spec.md
-- Root-cause writeup: specs/002-multi-org-isolation/research.md

-- ============================================================
-- 1. SECURITY DEFINER membership functions
--
-- These break RLS recursion. A policy on team_members that queries
-- team_members recurses; PostgreSQL returns null rather than erroring, which
-- presented as "login broken" and "all candidates disappeared". SECURITY
-- DEFINER functions run as the owner and do not re-enter RLS.
--
-- SET search_path = public is a security requirement, not style: without it
-- these functions are vulnerable to search-path hijacking.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
      AND role = 'admin' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
      AND role IN ('admin', 'recruiter') AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_staff_see_application(p_application_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM applications a
    JOIN hiring_posts hp ON hp.id = a.hiring_post_id
    JOIN team_members tm ON tm.org_id = hp.org_id
    WHERE a.id = p_application_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('admin', 'recruiter') AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_staff_see_candidate(p_candidate_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM applications a
    JOIN hiring_posts hp ON hp.id = a.hiring_post_id
    JOIN team_members tm ON tm.org_id = hp.org_id
    WHERE a.candidate_id = p_candidate_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('admin', 'recruiter') AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_staff_see_session(p_application_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM applications a
    JOIN hiring_posts hp ON hp.id = a.hiring_post_id
    JOIN team_members tm ON tm.org_id = hp.org_id
    WHERE a.id = p_application_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('admin', 'recruiter') AND tm.status = 'active'
  );
$$;

-- ============================================================
-- 2. RLS policies rewritten to use the functions above
-- ============================================================

-- team_members: self-select must stay non-recursive; it breaks the
-- chicken-and-egg of "resolving my org requires reading team_members".
DROP POLICY IF EXISTS "tm_self_select" ON team_members;
CREATE POLICY "tm_self_select" ON team_members FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tm_admin_all" ON team_members;
DROP POLICY IF EXISTS "tm_recruiter_self_select" ON team_members;
CREATE POLICY "tm_admin_all" ON team_members FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));

-- organizations
DROP POLICY IF EXISTS "org_admin_all" ON organizations;
DROP POLICY IF EXISTS "org_recruiter_select" ON organizations;
CREATE POLICY "org_admin_all" ON organizations FOR ALL
  USING (is_org_admin(id)) WITH CHECK (is_org_admin(id));
CREATE POLICY "org_recruiter_select" ON organizations FOR SELECT
  USING (is_org_member(id));

-- interview_templates
DROP POLICY IF EXISTS "it_admin_all" ON interview_templates;
DROP POLICY IF EXISTS "it_recruiter_select" ON interview_templates;
CREATE POLICY "it_admin_all" ON interview_templates FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "it_recruiter_select" ON interview_templates FOR SELECT
  USING (is_org_member(org_id));

-- hiring_posts
-- The anon policy previously matched authenticated users too, leaking published
-- jobs across orgs. The auth.uid() IS NULL guard confines it to the public
-- /apply page.
DROP POLICY IF EXISTS "hp_admin_all" ON hiring_posts;
DROP POLICY IF EXISTS "hp_recruiter_select" ON hiring_posts;
DROP POLICY IF EXISTS "hp_anon_published_select" ON hiring_posts;
CREATE POLICY "hp_admin_all" ON hiring_posts FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "hp_recruiter_select" ON hiring_posts FOR SELECT
  USING (is_org_member(org_id));
CREATE POLICY "hp_anon_published_select" ON hiring_posts FOR SELECT
  USING (status = 'published' AND share_slug IS NOT NULL AND auth.uid() IS NULL);

-- applications
DROP POLICY IF EXISTS "app_admin_all" ON applications;
DROP POLICY IF EXISTS "app_recruiter_select" ON applications;
DROP POLICY IF EXISTS "app_recruiter_update" ON applications;
DROP POLICY IF EXISTS "app_candidate_select" ON applications;
CREATE POLICY "app_admin_all" ON applications FOR ALL
  USING (can_staff_see_application(id)) WITH CHECK (can_staff_see_application(id));
CREATE POLICY "app_recruiter_select" ON applications FOR SELECT
  USING (can_staff_see_application(id));
CREATE POLICY "app_candidate_select" ON applications FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM candidates
    WHERE candidates.id = applications.candidate_id
      AND candidates.auth_user_id = auth.uid()
  ));

-- candidates
DROP POLICY IF EXISTS "cand_staff_select" ON candidates;
DROP POLICY IF EXISTS "cand_self_select" ON candidates;
CREATE POLICY "cand_staff_select" ON candidates FOR SELECT
  USING (can_staff_see_candidate(id));
CREATE POLICY "cand_self_select" ON candidates FOR SELECT
  USING (auth_user_id = auth.uid());

-- resume_data
DROP POLICY IF EXISTS "rd_staff_select" ON resume_data;
CREATE POLICY "rd_staff_select" ON resume_data FOR SELECT
  USING (can_staff_see_application(application_id));

-- interview_sessions
DROP POLICY IF EXISTS "is_staff_select" ON interview_sessions;
DROP POLICY IF EXISTS "is_candidate_select" ON interview_sessions;
DROP POLICY IF EXISTS "is_candidate_update" ON interview_sessions;
DROP POLICY IF EXISTS "is_admin_insert" ON interview_sessions;
CREATE POLICY "is_staff_select" ON interview_sessions FOR SELECT
  USING (can_staff_see_session(application_id));
CREATE POLICY "is_admin_insert" ON interview_sessions FOR INSERT
  WITH CHECK (can_staff_see_session(application_id));
CREATE POLICY "is_candidate_select" ON interview_sessions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    WHERE a.id = interview_sessions.application_id AND c.auth_user_id = auth.uid()
  ));
CREATE POLICY "is_candidate_update" ON interview_sessions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    WHERE a.id = interview_sessions.application_id AND c.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    WHERE a.id = interview_sessions.application_id AND c.auth_user_id = auth.uid()
  ));

-- interview_qa
DROP POLICY IF EXISTS "iqa_staff_select" ON interview_qa;
CREATE POLICY "iqa_staff_select" ON interview_qa FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM interview_sessions
    WHERE interview_sessions.id = interview_qa.session_id
      AND can_staff_see_session(interview_sessions.application_id)
  ));

-- interview_reports
DROP POLICY IF EXISTS "ir_staff_select" ON interview_reports;
DROP POLICY IF EXISTS "ir_anon_share_select" ON interview_reports;
CREATE POLICY "ir_staff_select" ON interview_reports FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM interview_sessions
    WHERE interview_sessions.id = interview_reports.session_id
      AND can_staff_see_session(interview_sessions.application_id)
  ));
CREATE POLICY "ir_anon_share_select" ON interview_reports FOR SELECT
  USING (share_token IS NOT NULL
         AND (share_expires_at IS NULL OR share_expires_at > now()));

-- invite_tokens
DROP POLICY IF EXISTS "it_admin_all" ON invite_tokens;
DROP POLICY IF EXISTS "it_self_select" ON invite_tokens;
CREATE POLICY "it_admin_all" ON invite_tokens FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "it_self_select" ON invite_tokens FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- ============================================================
-- 3. interview_reports columns the evaluator writes
--
-- Missing columns caused the evaluator's insert to fail silently, leaving
-- sessions marked 'completed' with no report row.
-- ============================================================

ALTER TABLE interview_reports
  ADD COLUMN IF NOT EXISTS notable_responses     jsonb,
  ADD COLUMN IF NOT EXISTS recommendation_detail text,
  ADD COLUMN IF NOT EXISTS dimension_averages    jsonb,
  ADD COLUMN IF NOT EXISTS candidate_email_body  text,
  ADD COLUMN IF NOT EXISTS share_token           text UNIQUE,
  ADD COLUMN IF NOT EXISTS share_expires_at      timestamptz;

-- ============================================================
-- 4. Drop the duplicate interview-session creator
--
-- Migration 008 creates this trigger. The screening Celery task also creates
-- sessions, so both fired and each application got two rows — breaking the
-- earlier invite link. The Celery task is the single owner of this write.
-- ============================================================

DROP TRIGGER IF EXISTS trg_auto_create_interview_session ON applications;
DROP FUNCTION IF EXISTS auto_create_interview_session CASCADE;
