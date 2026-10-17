-- 032_job_client_access.sql
--
-- Client job access: a person at a client company is granted read-only access
-- to specific job posts by email, without becoming staff or getting an org.
--
-- Spec: specs/003-client-job-access/spec.md
-- Verify: specs/003-client-job-access/verify-032.sql (read-only, production)
-- Test:   specs/003-client-job-access/rls-test-032.sql (local only)
--
-- job_client_access is the sole authority. Eligibility is decided in one place,
-- client_post_ids_for_user(): email-confirmed auth account carrying the
-- server-only marker raw_app_meta_data.int_ai_client = true, no team_members
-- row, and an active (revoked_at IS NULL) grant on the post.
-- All functions are SECURITY DEFINER with search_path pinned (the 002 pattern).
--
-- Why a marker in raw_app_meta_data: only the service role can write
-- app_metadata (users can edit user_metadata, not app_metadata), so the marker
-- proves the account was created or prepared by the invite endpoint. It is set
-- by create_user(app_metadata) for new accounts and by prepare_client_account()
-- for an account that existed before the invite. prepare_client_account() also
-- replaces that account's password with an unknowable one and ends its
-- sessions, so whoever registered the address in advance cannot keep using it;
-- only the mailbox owner can sign in again (email one-time code).
--
-- Why interview_sessions gets no client policy: invite_token and
-- reconnection_token on that table are bearer credentials for the live
-- interview. RLS filters rows, not columns, so any SELECT policy would hand
-- them to clients. Clients read session metadata only through
-- client_sessions_for_application(), which returns whitelisted columns.
--
-- Why ir_anon_share_select is recreated: as written in 004/022 it had no
-- auth.uid() IS NULL guard, so every signed-in user (now including clients)
-- could read every shared report in every org. The guard confines it to the
-- sessionless /report/[token] page, the same fix 022 applied to
-- hp_anon_published_select.
--
-- Why the client policies are TO authenticated: clients are always signed in,
-- and scoping the policies to that role means anonymous requests (/apply,
-- shared reports) never evaluate them. Policies use the
-- `col IN (SELECT set_returning_fn())` form so the function runs once per
-- query, not once per row.

BEGIN;

CREATE TABLE public.job_client_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hiring_post_id uuid NOT NULL REFERENCES public.hiring_posts(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
  client_company text,
  invited_by uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX job_client_access_active_uq ON public.job_client_access (hiring_post_id, email) WHERE revoked_at IS NULL;
CREATE INDEX job_client_access_email_idx ON public.job_client_access (email) WHERE revoked_at IS NULL;
ALTER TABLE public.job_client_access ENABLE ROW LEVEL SECURITY;

-- Single source of client eligibility. service_role only (backend change-request check).
CREATE OR REPLACE FUNCTION public.client_post_ids_for_user(p_user_id uuid) RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jca.hiring_post_id
  FROM job_client_access jca
  JOIN auth.users u ON u.id = p_user_id
  WHERE jca.revoked_at IS NULL
    AND jca.email = lower(u.email)
    AND u.email_confirmed_at IS NOT NULL
    AND (u.raw_app_meta_data->>'int_ai_client') = 'true'
    AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = p_user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.client_post_ids_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_post_ids_for_user(uuid) TO service_role;

-- Prepares the auth account for a client grant. service_role only (backend
-- invite endpoint, after auth.admin.create_user). Returns:
--   'missing'  no auth user has this email; nothing changed
--   'staff'    the user has a team_members row; nothing changed (the grant is inert)
--   'ready'    the user already carries the client marker; nothing changed
--   'prepared' a pre-existing non-staff account: marker set, password replaced
--              by a random unknowable bcrypt hash, phone cleared, non-email
--              identities and MFA factors deleted, all sessions deleted
--              (refresh tokens cascade from auth.sessions). Only the email
--              one-time code is left as a way to sign in.
CREATE OR REPLACE FUNCTION public.prepare_client_account(p_email text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_user auth.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM auth.users u WHERE lower(u.email) = v_email ORDER BY u.created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;
  IF EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = v_user.id) THEN
    RETURN 'staff';
  END IF;
  IF (v_user.raw_app_meta_data->>'int_ai_client') = 'true' THEN
    RETURN 'ready';
  END IF;
  UPDATE auth.users
     SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"int_ai_client": true}'::jsonb,
         encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)),
         phone = NULL,
         phone_confirmed_at = NULL
   WHERE id = v_user.id;
  DELETE FROM auth.identities WHERE user_id = v_user.id AND provider <> 'email';
  DELETE FROM auth.mfa_factors WHERE user_id = v_user.id;
  DELETE FROM auth.sessions WHERE user_id = v_user.id;
  RETURN 'prepared';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prepare_client_account(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_client_account(text) TO service_role;

CREATE OR REPLACE FUNCTION public.client_visible_post_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.client_post_ids_for_user(auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.client_visible_application_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT a.id FROM applications a WHERE a.hiring_post_id IN (SELECT public.client_visible_post_ids());
$$;
CREATE OR REPLACE FUNCTION public.client_visible_candidate_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT a.candidate_id FROM applications a WHERE a.hiring_post_id IN (SELECT public.client_visible_post_ids());
$$;
CREATE OR REPLACE FUNCTION public.client_visible_session_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT s.id FROM interview_sessions s WHERE s.application_id IN (SELECT public.client_visible_application_ids());
$$;
CREATE OR REPLACE FUNCTION public.client_sessions_for_application(p_application_id uuid)
RETURNS TABLE (id uuid, application_id uuid, status text, started_at timestamptz, ended_at timestamptz,
  duration_seconds integer, questions_asked integer, terminated_at_question integer,
  timer_remaining_at_termination real, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT s.id, s.application_id, s.status, s.started_at, s.ended_at, s.duration_seconds,
         s.questions_asked, s.terminated_at_question, s.timer_remaining_at_termination, s.created_at
  FROM interview_sessions s
  WHERE s.application_id = p_application_id
    AND p_application_id IN (SELECT public.client_visible_application_ids())
  ORDER BY s.created_at DESC;
$$;

CREATE POLICY "jca_admin_all" ON public.job_client_access FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hiring_posts hp WHERE hp.id = hiring_post_id AND is_org_admin(hp.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM hiring_posts hp WHERE hp.id = hiring_post_id AND is_org_admin(hp.org_id)));

CREATE POLICY "hp_client_select"   ON public.hiring_posts      FOR SELECT TO authenticated USING (id IN (SELECT public.client_visible_post_ids()));
CREATE POLICY "app_client_select"  ON public.applications      FOR SELECT TO authenticated USING (id IN (SELECT public.client_visible_application_ids()));
CREATE POLICY "cand_client_select" ON public.candidates        FOR SELECT TO authenticated USING (id IN (SELECT public.client_visible_candidate_ids()));
CREATE POLICY "rd_client_select"   ON public.resume_data       FOR SELECT TO authenticated USING (application_id IN (SELECT public.client_visible_application_ids()));
CREATE POLICY "iqa_client_select"  ON public.interview_qa      FOR SELECT TO authenticated USING (session_id IN (SELECT public.client_visible_session_ids()));
CREATE POLICY "ir_client_select"   ON public.interview_reports FOR SELECT TO authenticated USING (session_id IN (SELECT public.client_visible_session_ids()));
-- deliberately no policy on interview_sessions (invite_token / reconnection_token are bearer credentials)

-- Close pre-existing leak: shared reports readable by every signed-in user (022:205-207).
DROP POLICY IF EXISTS "ir_anon_share_select" ON public.interview_reports;
CREATE POLICY "ir_anon_share_select" ON public.interview_reports FOR SELECT
  USING (auth.uid() IS NULL AND share_token IS NOT NULL
         AND (share_expires_at IS NULL OR share_expires_at > now()));

COMMIT;
