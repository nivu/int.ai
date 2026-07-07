# Multi-Org Isolation & Candidate Evaluation Fixes
**Session Date:** 2026-07-04

---

## Problem
After running a SQL migration to add multi-org/multi-session isolation, the following broke:
1. Login stopped working entirely
2. All candidates disappeared from the admin panel
3. Published jobs from one org appeared in another org's admin panel
4. Candidate evaluation (interview reports) was not happening consistently

---

## Root Causes Found

### 1. Login Broken — RLS Infinite Recursion
The `tm_admin_all` policy on `team_members` queried `team_members` inside itself, causing infinite recursion. PostgreSQL silently returned null, the admin layout saw no team member, and redirected to login.

### 2. Candidates Missing — Cascading RLS Chain
Nested RLS policies across `candidates → applications → hiring_posts → team_members` were silently failing because each table's policy triggered the next table's policy recursively.

### 3. Published Jobs Leaking Cross-Org
The `hp_anon_published_select` policy allowed any user (authenticated or not) to see all published jobs. It was meant only for the anonymous public `/apply` page.

### 4. Evaluation Not Happening — Missing DB Columns
The `interview_reports` table was missing columns (`notable_responses`, `dimension_averages`, `candidate_email_body`, etc.) that the evaluator tried to insert. The insert failed silently, leaving sessions marked `completed` but with no report.

### 5. Duplicate Sessions & Double Evaluation
- A DB trigger (migration 008) AND the screening Celery task were both creating `interview_sessions` rows → two sessions per application, old invite links broken
- `evaluate_interview_task` was being enqueued from both `controller.finish()` in agent.py AND `end_session()` in session_manager.py → double LLM cost, second task errored

---

## SQL Fixes Applied (run in Supabase SQL Editor)

### Fix 1 — SECURITY DEFINER functions to break RLS recursion
```sql
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
```

### Fix 2 — Rewrite all RLS policies to use the functions
```sql
-- team_members self-select (breaks chicken-and-egg)
DROP POLICY IF EXISTS "tm_self_select" ON team_members;
CREATE POLICY "tm_self_select" ON team_members FOR SELECT USING (user_id = auth.uid());

-- organizations
DROP POLICY IF EXISTS "org_admin_all" ON organizations;
DROP POLICY IF EXISTS "org_recruiter_select" ON organizations;
CREATE POLICY "org_admin_all" ON organizations FOR ALL USING (is_org_admin(id)) WITH CHECK (is_org_admin(id));
CREATE POLICY "org_recruiter_select" ON organizations FOR SELECT USING (is_org_member(id));

-- team_members
DROP POLICY IF EXISTS "tm_admin_all" ON team_members;
DROP POLICY IF EXISTS "tm_recruiter_self_select" ON team_members;
CREATE POLICY "tm_admin_all" ON team_members FOR ALL USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));

-- interview_templates
DROP POLICY IF EXISTS "it_admin_all" ON interview_templates;
DROP POLICY IF EXISTS "it_recruiter_select" ON interview_templates;
CREATE POLICY "it_admin_all" ON interview_templates FOR ALL USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "it_recruiter_select" ON interview_templates FOR SELECT USING (is_org_member(org_id));

-- hiring_posts
DROP POLICY IF EXISTS "hp_admin_all" ON hiring_posts;
DROP POLICY IF EXISTS "hp_recruiter_select" ON hiring_posts;
DROP POLICY IF EXISTS "hp_anon_published_select" ON hiring_posts;
CREATE POLICY "hp_admin_all" ON hiring_posts FOR ALL USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "hp_recruiter_select" ON hiring_posts FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "hp_anon_published_select" ON hiring_posts FOR SELECT
  USING (status = 'published' AND share_slug IS NOT NULL AND auth.uid() IS NULL);

-- applications
DROP POLICY IF EXISTS "app_admin_all" ON applications;
DROP POLICY IF EXISTS "app_recruiter_select" ON applications;
DROP POLICY IF EXISTS "app_recruiter_update" ON applications;
DROP POLICY IF EXISTS "app_candidate_select" ON applications;
CREATE POLICY "app_admin_all" ON applications FOR ALL USING (can_staff_see_application(id)) WITH CHECK (can_staff_see_application(id));
CREATE POLICY "app_recruiter_select" ON applications FOR SELECT USING (can_staff_see_application(id));
CREATE POLICY "app_candidate_select" ON applications FOR SELECT
  USING (EXISTS (SELECT 1 FROM candidates WHERE candidates.id = applications.candidate_id AND candidates.auth_user_id = auth.uid()));

-- candidates
DROP POLICY IF EXISTS "cand_staff_select" ON candidates;
DROP POLICY IF EXISTS "cand_self_select" ON candidates;
CREATE POLICY "cand_staff_select" ON candidates FOR SELECT USING (can_staff_see_candidate(id));
CREATE POLICY "cand_self_select" ON candidates FOR SELECT USING (auth_user_id = auth.uid());

-- resume_data
DROP POLICY IF EXISTS "rd_staff_select" ON resume_data;
CREATE POLICY "rd_staff_select" ON resume_data FOR SELECT USING (can_staff_see_application(application_id));

-- interview_sessions
DROP POLICY IF EXISTS "is_staff_select" ON interview_sessions;
DROP POLICY IF EXISTS "is_candidate_select" ON interview_sessions;
DROP POLICY IF EXISTS "is_candidate_update" ON interview_sessions;
DROP POLICY IF EXISTS "is_admin_insert" ON interview_sessions;
CREATE POLICY "is_staff_select" ON interview_sessions FOR SELECT USING (can_staff_see_session(application_id));
CREATE POLICY "is_admin_insert" ON interview_sessions FOR INSERT WITH CHECK (can_staff_see_session(application_id));
CREATE POLICY "is_candidate_select" ON interview_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = interview_sessions.application_id AND c.auth_user_id = auth.uid()));
CREATE POLICY "is_candidate_update" ON interview_sessions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = interview_sessions.application_id AND c.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = interview_sessions.application_id AND c.auth_user_id = auth.uid()));

-- interview_qa
DROP POLICY IF EXISTS "iqa_staff_select" ON interview_qa;
CREATE POLICY "iqa_staff_select" ON interview_qa FOR SELECT
  USING (EXISTS (SELECT 1 FROM interview_sessions WHERE interview_sessions.id = interview_qa.session_id AND can_staff_see_session(interview_sessions.application_id)));

-- interview_reports
DROP POLICY IF EXISTS "ir_staff_select" ON interview_reports;
DROP POLICY IF EXISTS "ir_anon_share_select" ON interview_reports;
CREATE POLICY "ir_staff_select" ON interview_reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM interview_sessions WHERE interview_sessions.id = interview_reports.session_id AND can_staff_see_session(interview_sessions.application_id)));
CREATE POLICY "ir_anon_share_select" ON interview_reports FOR SELECT
  USING (share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > now()));

-- invite_tokens
DROP POLICY IF EXISTS "it_admin_all" ON invite_tokens;
DROP POLICY IF EXISTS "it_self_select" ON invite_tokens;
CREATE POLICY "it_admin_all" ON invite_tokens FOR ALL USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "it_self_select" ON invite_tokens FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
```

### Fix 3 — Add missing columns to interview_reports
```sql
ALTER TABLE interview_reports
  ADD COLUMN IF NOT EXISTS notable_responses jsonb,
  ADD COLUMN IF NOT EXISTS recommendation_detail text,
  ADD COLUMN IF NOT EXISTS dimension_averages jsonb,
  ADD COLUMN IF NOT EXISTS candidate_email_body text,
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS share_expires_at timestamptz;
```

### Fix 4 — Drop duplicate session creation trigger
```sql
DROP TRIGGER IF EXISTS trg_auto_create_interview_session ON applications;
DROP FUNCTION IF EXISTS auto_create_interview_session CASCADE;
```

### Fix 5 — Set backend URL for pg_net webhook (replace with your Railway URL)
```sql
ALTER DATABASE postgres SET app.backend_url = 'https://YOUR-RAILWAY-URL.up.railway.app';
```

---

## Backend Code Changes

### `backend/app/interview/session_manager.py`
- Removed duplicate `evaluate_interview_task` enqueue from `end_session()`. Agent's `controller.finish()` is the only trigger now.

### `backend/app/api/interview.py`
- `GET /{session_id}/summary` — added `authorization` header + org ownership check
- `POST /create-room` — added `authorization` header + org ownership check
- `POST /evaluate` — added `authorization` header + org ownership check

### `backend/app/api/screening.py`
- `GET /status/{task_id}` — added `authorization` header (requires admin auth)

### `backend/app/api/email.py`
- `POST /send` — added `authorization` header
- `POST /bulk-custom` — added `authorization` header
- `/application-confirmation` left open (called after public candidate submissions)

### `backend/app/api/invitations.py`
- `POST /send` — added `authorization` header + `_resolve_admin_org()` check

### `backend/app/interview/evaluator.py`
- Added idempotency guard in Q&A scoring loop — skips rows that already have scores, so retries don't double-score

---

## Remaining TODO

- [ ] Set `app.backend_url` in Supabase to your Railway backend URL
- [ ] Verify pg_net extension is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_net';`
- [ ] Test full flow: submit application → check screening → check interview session created → complete interview → check `interview_reports` row exists
- [ ] Verify cross-org isolation: org A admin cannot see org B's jobs/candidates

---

## Key Files Changed
- `backend/app/api/interview.py`
- `backend/app/api/screening.py`
- `backend/app/api/email.py`
- `backend/app/api/invitations.py`
- `backend/app/interview/session_manager.py`
- `backend/app/interview/evaluator.py`
