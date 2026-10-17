-- RLS test for migration 032 (client job access).
--
-- LOCAL ONLY. Seeds data, impersonates users, asserts row visibility, and
-- ROLLBACKs everything. Never run against production: it writes to auth.users.
--
--   docker exec -i supabase_db_<project_id> psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     < specs/003-client-job-access/rls-test-032.sql
--
-- Exit status 0 and a final "ALL CHECKS PASSED" notice means every assertion
-- held. Any failed assertion raises "FAIL <label>: ..." and aborts the run.
--
-- Spec: specs/003-client-job-access/spec.md (SC-001 to SC-004)
--
-- Seed (all ids end in the same digits for readability):
--   O1: admin A, recruiter R. Jobs J (published) and K (draft), each with an
--       application, candidate, resume_data (created by the 018 trigger, then
--       updated), session, QA row and report. K's report has a live share_token;
--       J's has none.
--   O2: staff S2, and admin A2.
--   Every auth user is seeded the way GoTrue creates them: a non-empty bcrypt
--   encrypted_password (GoTrue stores one even for passwordless accounts) and
--   provider app_metadata. "marker" = raw_app_meta_data.int_ai_client = the account's lower-cased email.
--   Grants on J: C (confirmed, marker), C2 (unconfirmed, marker), C3
--       (confirmed, marker, also K's candidate), C4 (confirmed, NO marker: an
--       account registered before the invite, with a live session), A2 (staff,
--       confirmed, marker). Each of C2, C4 and A2 fails exactly one eligibility
--       rule, so each check isolates that rule. C4 is then prepared with
--       prepare_client_account() and becomes a client.

BEGIN;

-- ------------------------------------------------------------
-- Assertion helpers (pg_temp, so they vanish with the session)
-- ------------------------------------------------------------
CREATE FUNCTION pg_temp.expect(label text, got bigint, want bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, want, got;
  END IF;
  RAISE NOTICE 'ok   %', label;
END $$;

-- Runs a statement and returns how many rows it affected.
CREATE FUNCTION pg_temp.affected(stmt text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Asserts a statement raises one of the given SQLSTATEs.
CREATE FUNCTION pg_temp.expect_error(label text, stmt text, states text[]) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = ANY(states) THEN
      RAISE NOTICE 'ok   % (raised %: %)', label, SQLSTATE, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL %: expected SQLSTATE in %, got %: %', label, states, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: statement succeeded, expected an error', label;
END $$;

-- ------------------------------------------------------------
-- Seed (as postgres)
-- ------------------------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data) VALUES
  ('00000032-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@rls032.test',    extensions.crypt('pw-a',  extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'),                       -- A
  ('00000032-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recruiter-r@rls032.test', extensions.crypt('pw-r',  extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'),                       -- R
  ('00000032-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff-s2@rls032.test',   extensions.crypt('pw-s2', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'),                       -- S2
  ('00000032-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Client-C@RLS032.test',   extensions.crypt('pw-c',  extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"int_ai_client":"client-c@rls032.test"}'),  -- C (mixed case: matching must lower-case)
  ('00000032-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-c2@rls032.test',  extensions.crypt('pw-c2', extensions.gen_salt('bf')), NULL,  '{"provider":"email","providers":["email"],"int_ai_client":"client-c2@rls032.test"}'),  -- C2 unconfirmed
  ('00000032-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-c3@rls032.test',  extensions.crypt('pw-c3', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"int_ai_client":"client-c3@rls032.test"}'),  -- C3
  ('00000032-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-c4@rls032.test',  extensions.crypt('pw-c4', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'),                       -- C4 no marker (pre-registered)
  ('00000032-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a2@rls032.test',   extensions.crypt('pw-a2', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"int_ai_client":"admin-a2@rls032.test"}');  -- A2 staff, marker present

-- C4 is signed in: one session with one refresh token.
INSERT INTO auth.sessions (id, user_id, created_at) VALUES
  ('00000032-0000-0000-0000-0000000000c4', '00000032-0000-0000-0000-000000000007', now());
INSERT INTO auth.refresh_tokens (instance_id, token, user_id, session_id, revoked, created_at) VALUES
  ('00000000-0000-0000-0000-000000000000', 'rls032-refresh-c4', '00000032-0000-0000-0000-000000000007', '00000032-0000-0000-0000-0000000000c4', false, now());

INSERT INTO organizations (id, name, slug) VALUES
  ('00000032-0000-0000-0000-000000000021', 'RLS032 Org One', 'rls032-org-one'),
  ('00000032-0000-0000-0000-000000000022', 'RLS032 Org Two', 'rls032-org-two');

INSERT INTO team_members (id, org_id, user_id, role, status) VALUES
  ('00000032-0000-0000-0000-000000000011', '00000032-0000-0000-0000-000000000021', '00000032-0000-0000-0000-000000000001', 'admin',     'active'),  -- A
  ('00000032-0000-0000-0000-000000000012', '00000032-0000-0000-0000-000000000021', '00000032-0000-0000-0000-000000000002', 'recruiter', 'active'),  -- R
  ('00000032-0000-0000-0000-000000000013', '00000032-0000-0000-0000-000000000022', '00000032-0000-0000-0000-000000000003', 'recruiter', 'active'),  -- S2
  ('00000032-0000-0000-0000-000000000018', '00000032-0000-0000-0000-000000000022', '00000032-0000-0000-0000-000000000008', 'admin',     'active');  -- A2

INSERT INTO interview_templates (id, org_id, name) VALUES
  ('00000032-0000-0000-0000-000000000031', '00000032-0000-0000-0000-000000000021', 'RLS032 template');

INSERT INTO hiring_posts (id, org_id, created_by, title, description, status, interview_template_id) VALUES
  ('00000032-0000-0000-0000-000000000041', '00000032-0000-0000-0000-000000000021', '00000032-0000-0000-0000-000000000011', 'Job J', 'J desc', 'published', '00000032-0000-0000-0000-000000000031'),
  ('00000032-0000-0000-0000-000000000042', '00000032-0000-0000-0000-000000000021', '00000032-0000-0000-0000-000000000011', 'Job K', 'K desc', 'draft',     '00000032-0000-0000-0000-000000000031');

INSERT INTO hiring_post_private (hiring_post_id, culture_expectation) VALUES
  ('00000032-0000-0000-0000-000000000041', 'J culture'),
  ('00000032-0000-0000-0000-000000000042', 'K culture');

INSERT INTO candidates (id, email, full_name, auth_user_id) VALUES
  ('00000032-0000-0000-0000-000000000051', 'cand-j@rls032.test',    'Candidate J', NULL),
  ('00000032-0000-0000-0000-000000000052', 'client-c3@rls032.test', 'Candidate K (C3)', '00000032-0000-0000-0000-000000000006');

INSERT INTO applications (id, hiring_post_id, candidate_id, resume_url, resume_filename, status) VALUES
  ('00000032-0000-0000-0000-000000000061', '00000032-0000-0000-0000-000000000041', '00000032-0000-0000-0000-000000000051', 'resumes/j.pdf', 'j.pdf', 'applied'),
  ('00000032-0000-0000-0000-000000000062', '00000032-0000-0000-0000-000000000042', '00000032-0000-0000-0000-000000000052', 'resumes/k.pdf', 'k.pdf', 'applied');

-- resume_data rows come from the 018 trigger on application insert: update, never insert.
UPDATE resume_data SET parsed_summary = 'J summary' WHERE application_id = '00000032-0000-0000-0000-000000000061';
UPDATE resume_data SET parsed_summary = 'K summary' WHERE application_id = '00000032-0000-0000-0000-000000000062';
SELECT pg_temp.expect('seed: resume_data rows created by trigger',
  (SELECT count(*) FROM resume_data WHERE application_id IN ('00000032-0000-0000-0000-000000000061', '00000032-0000-0000-0000-000000000062') AND parsed_summary IS NOT NULL), 2);

INSERT INTO interview_sessions (id, application_id, template_id, status, reconnection_token) VALUES
  ('00000032-0000-0000-0000-000000000071', '00000032-0000-0000-0000-000000000061', '00000032-0000-0000-0000-000000000031', 'completed', 'recon-j'),
  ('00000032-0000-0000-0000-000000000072', '00000032-0000-0000-0000-000000000062', '00000032-0000-0000-0000-000000000031', 'completed', 'recon-k');

INSERT INTO interview_qa (id, session_id, question_number, question_type, question_text) VALUES
  ('00000032-0000-0000-0000-000000000081', '00000032-0000-0000-0000-000000000071', 1, 'foundational', 'J question'),
  ('00000032-0000-0000-0000-000000000082', '00000032-0000-0000-0000-000000000072', 1, 'foundational', 'K question');

INSERT INTO interview_reports (id, session_id, overall_grade, recommendation, summary, share_token, share_expires_at) VALUES
  ('00000032-0000-0000-0000-000000000091', '00000032-0000-0000-0000-000000000071', 0.8, 'advance', 'J report', NULL,             NULL),
  ('00000032-0000-0000-0000-000000000092', '00000032-0000-0000-0000-000000000072', 0.4, 'reject',  'K report', 'rls032-share-k', now() + interval '1 day');

INSERT INTO job_client_access (id, hiring_post_id, email, client_company, invited_by) VALUES
  ('00000032-0000-0000-0000-0000000000a1', '00000032-0000-0000-0000-000000000041', 'client-c@rls032.test',  'Client Co', '00000032-0000-0000-0000-000000000011'),
  ('00000032-0000-0000-0000-0000000000a2', '00000032-0000-0000-0000-000000000041', 'client-c2@rls032.test', 'Client Co', '00000032-0000-0000-0000-000000000011'),
  ('00000032-0000-0000-0000-0000000000a3', '00000032-0000-0000-0000-000000000041', 'client-c3@rls032.test', 'Client Co', '00000032-0000-0000-0000-000000000011'),
  ('00000032-0000-0000-0000-0000000000a4', '00000032-0000-0000-0000-000000000041', 'client-c4@rls032.test', 'Client Co', '00000032-0000-0000-0000-000000000011'),
  ('00000032-0000-0000-0000-0000000000a5', '00000032-0000-0000-0000-000000000041', 'admin-a2@rls032.test',  'Client Co', '00000032-0000-0000-0000-000000000011');

-- Rows in the other FR-005 tables, so "C sees 0 rows" is meaningful.
INSERT INTO invite_tokens (org_id, email, created_by) VALUES
  ('00000032-0000-0000-0000-000000000021', 'invitee@rls032.test', '00000032-0000-0000-0000-000000000011');
INSERT INTO api_keys (org_id, team_member_id, name, key_prefix, key_hash) VALUES
  ('00000032-0000-0000-0000-000000000021', '00000032-0000-0000-0000-000000000011', 'rls032 key', 'rls032', 'rls032-hash');
INSERT INTO ai_usage (org_id, hiring_post_id, application_id, provider, model, operation) VALUES
  ('00000032-0000-0000-0000-000000000021', '00000032-0000-0000-0000-000000000041', '00000032-0000-0000-0000-000000000061', 'openai', 'gpt-4o-mini', 'score_resume');

-- Table constraints the backend relies on (as postgres).
SELECT pg_temp.expect_error('jca: second active grant for (J, C) is a unique violation',
  $q$INSERT INTO job_client_access (hiring_post_id, email) VALUES ('00000032-0000-0000-0000-000000000041', 'client-c@rls032.test')$q$,
  ARRAY['23505']);
SELECT pg_temp.expect_error('jca: email must be stored lower-cased and trimmed',
  $q$INSERT INTO job_client_access (hiring_post_id, email) VALUES ('00000032-0000-0000-0000-000000000042', ' Client-C@rls032.test')$q$,
  ARRAY['23514']);

-- ============================================================
-- C: confirmed, marker, granted on J
-- ============================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);

SELECT pg_temp.expect('C: client_visible_post_ids() is exactly 1 row',  (SELECT count(*) FROM client_visible_post_ids()), 1);
SELECT pg_temp.expect('C: client_visible_post_ids() contains J',         (SELECT count(*) FROM client_visible_post_ids() p WHERE p = '00000032-0000-0000-0000-000000000041'), 1);

-- Exactly J's rows: one visible row per table, and it is J's.
SELECT pg_temp.expect('C: hiring_posts total',       (SELECT count(*) FROM hiring_posts), 1);
SELECT pg_temp.expect('C: hiring_posts J',           (SELECT count(*) FROM hiring_posts WHERE id = '00000032-0000-0000-0000-000000000041'), 1);
SELECT pg_temp.expect('C: applications total',       (SELECT count(*) FROM applications), 1);
SELECT pg_temp.expect('C: applications J',           (SELECT count(*) FROM applications WHERE id = '00000032-0000-0000-0000-000000000061'), 1);
SELECT pg_temp.expect('C: candidates total',         (SELECT count(*) FROM candidates), 1);
SELECT pg_temp.expect('C: candidates J',             (SELECT count(*) FROM candidates WHERE id = '00000032-0000-0000-0000-000000000051'), 1);
SELECT pg_temp.expect('C: resume_data total',        (SELECT count(*) FROM resume_data), 1);
SELECT pg_temp.expect('C: resume_data J',            (SELECT count(*) FROM resume_data WHERE application_id = '00000032-0000-0000-0000-000000000061'), 1);
SELECT pg_temp.expect('C: interview_qa total',       (SELECT count(*) FROM interview_qa), 1);
SELECT pg_temp.expect('C: interview_qa J',           (SELECT count(*) FROM interview_qa WHERE id = '00000032-0000-0000-0000-000000000081'), 1);
SELECT pg_temp.expect('C: interview_reports total',  (SELECT count(*) FROM interview_reports), 1);
SELECT pg_temp.expect('C: interview_reports J',      (SELECT count(*) FROM interview_reports WHERE id = '00000032-0000-0000-0000-000000000091'), 1);
-- K, including K's live shared report (ir_anon_share_select guard).
SELECT pg_temp.expect('C: hiring_posts K',           (SELECT count(*) FROM hiring_posts WHERE id = '00000032-0000-0000-0000-000000000042'), 0);
SELECT pg_temp.expect('C: K shared report by token', (SELECT count(*) FROM interview_reports WHERE share_token = 'rls032-share-k'), 0);

-- FR-005: tables clients must not read at all.
SELECT pg_temp.expect('C: interview_sessions',  (SELECT count(*) FROM interview_sessions), 0);
SELECT pg_temp.expect('C: hiring_post_private', (SELECT count(*) FROM hiring_post_private), 0);
SELECT pg_temp.expect('C: job_client_access',   (SELECT count(*) FROM job_client_access), 0);
SELECT pg_temp.expect('C: interview_templates', (SELECT count(*) FROM interview_templates), 0);
SELECT pg_temp.expect('C: team_members',        (SELECT count(*) FROM team_members), 0);
SELECT pg_temp.expect('C: organizations',       (SELECT count(*) FROM organizations), 0);
-- invite_tokens: reading it as any non-admin signed-in user raises 42501,
-- because 022's it_self_select subqueries auth.users, which authenticated
-- cannot read. Pre-existing and unchanged by 032; the client gets no rows.
SELECT pg_temp.expect_error('C: invite_tokens', $q$SELECT count(*) FROM invite_tokens$q$, ARRAY['42501']);
SELECT pg_temp.expect('C: api_keys',            (SELECT count(*) FROM api_keys), 0);
SELECT pg_temp.expect('C: ai_usage',            (SELECT count(*) FROM ai_usage), 0);

-- Session metadata only through the whitelisted RPC.
SELECT pg_temp.expect('C: client_sessions_for_application(J app)', (SELECT count(*) FROM client_sessions_for_application('00000032-0000-0000-0000-000000000061')), 1);
SELECT pg_temp.expect('C: client_sessions_for_application(K app)', (SELECT count(*) FROM client_sessions_for_application('00000032-0000-0000-0000-000000000062')), 0);

-- The eligibility function is service_role only. Asserted on the privilege,
-- not by calling it: in the local image (supabase/postgres 17.6.1.104) a
-- "permission denied for function" error raised after `SET ROLE anon` or
-- `SET ROLE authenticated` from a postgres session crashes the backend with
-- signal 11 (supautils.hint_roles). The real path is unaffected: the same call
-- through PostgREST, with an anon or an authenticated JWT, returns 42501
-- "permission denied for function client_post_ids_for_user".
SELECT pg_temp.expect('C: client_post_ids_for_user() is not executable',
  (SELECT count(*) FROM (SELECT 1 WHERE has_function_privilege(current_user, 'public.client_post_ids_for_user(uuid)', 'EXECUTE')) x), 0);
SELECT pg_temp.expect('C: current_user is authenticated', (SELECT count(*) FROM (SELECT 1 WHERE current_user = 'authenticated') x), 1);

-- Writes (SC-002). UPDATE and DELETE change 0 rows on every table, including
-- rows C can read.
SELECT pg_temp.expect('C: UPDATE applications status',  pg_temp.affected($q$UPDATE applications SET status = 'shortlisted' WHERE id = '00000032-0000-0000-0000-000000000061'$q$), 0);
SELECT pg_temp.expect('C: DELETE resume_data',          pg_temp.affected($q$DELETE FROM resume_data WHERE application_id = '00000032-0000-0000-0000-000000000061'$q$), 0);
SELECT pg_temp.expect('C: UPDATE hiring_posts',         pg_temp.affected($q$UPDATE hiring_posts SET title = 'x' WHERE id = '00000032-0000-0000-0000-000000000041'$q$), 0);
SELECT pg_temp.expect('C: DELETE hiring_posts',         pg_temp.affected($q$DELETE FROM hiring_posts WHERE id = '00000032-0000-0000-0000-000000000041'$q$), 0);
SELECT pg_temp.expect('C: DELETE applications',         pg_temp.affected($q$DELETE FROM applications WHERE id = '00000032-0000-0000-0000-000000000061'$q$), 0);
SELECT pg_temp.expect('C: UPDATE candidates',           pg_temp.affected($q$UPDATE candidates SET full_name = 'x' WHERE id = '00000032-0000-0000-0000-000000000051'$q$), 0);
SELECT pg_temp.expect('C: DELETE candidates',           pg_temp.affected($q$DELETE FROM candidates WHERE id = '00000032-0000-0000-0000-000000000051'$q$), 0);
SELECT pg_temp.expect('C: UPDATE resume_data',          pg_temp.affected($q$UPDATE resume_data SET parsed_summary = 'x' WHERE application_id = '00000032-0000-0000-0000-000000000061'$q$), 0);
SELECT pg_temp.expect('C: UPDATE interview_qa',         pg_temp.affected($q$UPDATE interview_qa SET question_text = 'x' WHERE id = '00000032-0000-0000-0000-000000000081'$q$), 0);
SELECT pg_temp.expect('C: DELETE interview_qa',         pg_temp.affected($q$DELETE FROM interview_qa WHERE id = '00000032-0000-0000-0000-000000000081'$q$), 0);
SELECT pg_temp.expect('C: UPDATE interview_reports',    pg_temp.affected($q$UPDATE interview_reports SET summary = 'x' WHERE id = '00000032-0000-0000-0000-000000000091'$q$), 0);
SELECT pg_temp.expect('C: DELETE interview_reports',    pg_temp.affected($q$DELETE FROM interview_reports WHERE id = '00000032-0000-0000-0000-000000000091'$q$), 0);
SELECT pg_temp.expect('C: UPDATE interview_sessions',   pg_temp.affected($q$UPDATE interview_sessions SET status = 'expired' WHERE id = '00000032-0000-0000-0000-000000000071'$q$), 0);
SELECT pg_temp.expect('C: UPDATE own grant (un-revoke)',pg_temp.affected($q$UPDATE job_client_access SET revoked_at = NULL WHERE id = '00000032-0000-0000-0000-0000000000a1'$q$), 0);
SELECT pg_temp.expect('C: DELETE own grant',            pg_temp.affected($q$DELETE FROM job_client_access WHERE id = '00000032-0000-0000-0000-0000000000a1'$q$), 0);

SELECT pg_temp.expect_error('C: INSERT interview_reports',
  $q$INSERT INTO interview_reports (session_id, overall_grade, summary) VALUES ('00000032-0000-0000-0000-000000000071', 1, 'forged')$q$,
  ARRAY['42501']);
SELECT pg_temp.expect_error('C: INSERT job_client_access (self-grant on K)',
  $q$INSERT INTO job_client_access (hiring_post_id, email) VALUES ('00000032-0000-0000-0000-000000000042', 'client-c@rls032.test')$q$,
  ARRAY['42501']);
-- An application on draft K must be refused. 42501 is the 023 WITH CHECK
-- (K is not published); 42P17 is the pre-existing policy recursion described
-- in the anon section below. Either way no row is written.
SELECT pg_temp.expect_error('C: INSERT applications on draft K',
  $q$INSERT INTO applications (hiring_post_id, candidate_id, resume_url, resume_filename) VALUES ('00000032-0000-0000-0000-000000000042', '00000032-0000-0000-0000-000000000051', 'r', 'f')$q$,
  ARRAY['42501', '42P17']);
-- Not asserted: an insert into applications on published J. The 023
-- app_anon_insert policy is TO public, so it applies to a signed-in client
-- exactly as to an anonymous visitor (spec 003, "Pre-existing public insert
-- policies"); 032 does not change it.

-- ============================================================
-- Revocation (SC-003), then restore with a new grant (US3 scenario 2)
-- ============================================================
RESET ROLE;
UPDATE job_client_access SET revoked_at = now() WHERE id = '00000032-0000-0000-0000-0000000000a1';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('C revoked: client_visible_post_ids()', (SELECT count(*) FROM client_visible_post_ids()), 0);
SELECT pg_temp.expect('C revoked: hiring_posts',      (SELECT count(*) FROM hiring_posts), 0);
SELECT pg_temp.expect('C revoked: applications',      (SELECT count(*) FROM applications), 0);
SELECT pg_temp.expect('C revoked: candidates',        (SELECT count(*) FROM candidates), 0);
SELECT pg_temp.expect('C revoked: resume_data',       (SELECT count(*) FROM resume_data), 0);
SELECT pg_temp.expect('C revoked: interview_qa',      (SELECT count(*) FROM interview_qa), 0);
SELECT pg_temp.expect('C revoked: interview_reports', (SELECT count(*) FROM interview_reports), 0);
SELECT pg_temp.expect('C revoked: client_sessions_for_application(J app)', (SELECT count(*) FROM client_sessions_for_application('00000032-0000-0000-0000-000000000061')), 0);

RESET ROLE;
-- A new active row next to the revoked one is allowed by the partial unique index.
INSERT INTO job_client_access (id, hiring_post_id, email, invited_by) VALUES
  ('00000032-0000-0000-0000-0000000000a6', '00000032-0000-0000-0000-000000000041', 'client-c@rls032.test', '00000032-0000-0000-0000-000000000011');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('C re-granted: hiring_posts J', (SELECT count(*) FROM hiring_posts WHERE id = '00000032-0000-0000-0000-000000000041'), 1);
SELECT pg_temp.expect('C re-granted: applications',   (SELECT count(*) FROM applications), 1);

-- ============================================================
-- C2 (unconfirmed) and C4 (no marker): nothing
-- ============================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('C2: client_visible_post_ids()', (SELECT count(*) FROM client_visible_post_ids()), 0);
SELECT pg_temp.expect('C2: hiring_posts',      (SELECT count(*) FROM hiring_posts), 0);
SELECT pg_temp.expect('C2: applications',      (SELECT count(*) FROM applications), 0);
SELECT pg_temp.expect('C2: candidates',        (SELECT count(*) FROM candidates), 0);
SELECT pg_temp.expect('C2: resume_data',       (SELECT count(*) FROM resume_data), 0);
SELECT pg_temp.expect('C2: interview_qa',      (SELECT count(*) FROM interview_qa), 0);
SELECT pg_temp.expect('C2: interview_reports', (SELECT count(*) FROM interview_reports), 0);

SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000007', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('C4: client_visible_post_ids()', (SELECT count(*) FROM client_visible_post_ids()), 0);
SELECT pg_temp.expect('C4: hiring_posts',      (SELECT count(*) FROM hiring_posts), 0);
SELECT pg_temp.expect('C4: applications',      (SELECT count(*) FROM applications), 0);
SELECT pg_temp.expect('C4: candidates',        (SELECT count(*) FROM candidates), 0);
SELECT pg_temp.expect('C4: resume_data',       (SELECT count(*) FROM resume_data), 0);
SELECT pg_temp.expect('C4: interview_qa',      (SELECT count(*) FROM interview_qa), 0);
SELECT pg_temp.expect('C4: interview_reports', (SELECT count(*) FROM interview_reports), 0);

-- ============================================================
-- prepare_client_account() (FR-007): 'missing', 'staff', 'ready', 'prepared'
-- ============================================================
RESET ROLE;
-- EXECUTE is service_role only. Asserted on the privilege, not by a call
-- (see the note in the C section).
SELECT pg_temp.expect('prepare: anon cannot execute',
  (SELECT count(*) FROM (SELECT 1 WHERE has_function_privilege('anon', 'public.prepare_client_account(text)', 'EXECUTE')) x), 0);
SELECT pg_temp.expect('prepare: authenticated cannot execute',
  (SELECT count(*) FROM (SELECT 1 WHERE has_function_privilege('authenticated', 'public.prepare_client_account(text)', 'EXECUTE')) x), 0);
SELECT pg_temp.expect('prepare: service_role can execute',
  (SELECT count(*) FROM (SELECT 1 WHERE has_function_privilege('service_role', 'public.prepare_client_account(text)', 'EXECUTE')) x), 1);

CREATE TEMP TABLE rls032_before ON COMMIT DROP AS
  SELECT id, encrypted_password, raw_app_meta_data FROM auth.users WHERE email LIKE '%rls032.test' OR email LIKE '%RLS032.test';
CREATE FUNCTION pg_temp.unchanged(p_id uuid) RETURNS bigint
LANGUAGE sql AS $$
  SELECT count(*) FROM auth.users u JOIN rls032_before b USING (id)
  WHERE u.id = p_id AND u.encrypted_password = b.encrypted_password AND u.raw_app_meta_data = b.raw_app_meta_data;
$$;
CREATE FUNCTION pg_temp.is(label text, got text, want text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, want, got;
  END IF;
  RAISE NOTICE 'ok   %', label;
END $$;

SELECT pg_temp.is('prepare: no auth user -> missing', public.prepare_client_account('nobody@rls032.test'), 'missing');

-- Staff (A has no marker): nothing changes, so the grant stays inert.
SELECT pg_temp.is('prepare: staff A -> staff', public.prepare_client_account('admin-a@rls032.test'), 'staff');
SELECT pg_temp.expect('prepare: staff A unchanged', pg_temp.unchanged('00000032-0000-0000-0000-000000000001'), 1);
SELECT pg_temp.is('prepare: staff A2 with marker -> staff', public.prepare_client_account('admin-a2@rls032.test'), 'staff');
SELECT pg_temp.expect('prepare: staff A2 unchanged', pg_temp.unchanged('00000032-0000-0000-0000-000000000008'), 1);

-- Already marked (C, looked up case- and space-insensitively): nothing changes.
SELECT pg_temp.is('prepare: marked C -> ready', public.prepare_client_account('  CLIENT-C@rls032.test '), 'ready');
SELECT pg_temp.expect('prepare: marked C unchanged', pg_temp.unchanged('00000032-0000-0000-0000-000000000004'), 1);

-- Pre-registered C4: marked, password replaced, sessions ended.
SELECT pg_temp.expect('prepare: C4 has a session before', (SELECT count(*) FROM auth.sessions WHERE user_id = '00000032-0000-0000-0000-000000000007'), 1);
SELECT pg_temp.expect('prepare: C4 has a refresh token before', (SELECT count(*) FROM auth.refresh_tokens WHERE user_id = '00000032-0000-0000-0000-000000000007'), 1);
SELECT pg_temp.is('prepare: pre-registered C4 -> prepared', public.prepare_client_account('client-c4@rls032.test'), 'prepared');
SELECT pg_temp.expect('prepare: C4 marker set',
  (SELECT count(*) FROM auth.users WHERE id = '00000032-0000-0000-0000-000000000007' AND raw_app_meta_data->>'int_ai_client' = 'client-c4@rls032.test'), 1);
SELECT pg_temp.expect('prepare: C4 provider app_metadata kept',
  (SELECT count(*) FROM auth.users WHERE id = '00000032-0000-0000-0000-000000000007' AND raw_app_meta_data->>'provider' = 'email'), 1);
SELECT pg_temp.expect('prepare: C4 password changed',
  (SELECT count(*) FROM auth.users u JOIN rls032_before b USING (id) WHERE u.id = '00000032-0000-0000-0000-000000000007' AND u.encrypted_password <> b.encrypted_password), 1);
SELECT pg_temp.expect('prepare: C4 old password no longer matches',
  (SELECT count(*) FROM auth.users WHERE id = '00000032-0000-0000-0000-000000000007' AND encrypted_password = extensions.crypt('pw-c4', encrypted_password)), 0);
SELECT pg_temp.expect('prepare: C4 new password is a bcrypt hash',
  (SELECT count(*) FROM auth.users WHERE id = '00000032-0000-0000-0000-000000000007' AND encrypted_password LIKE '$2a$10$%' AND length(encrypted_password) = 60), 1);
SELECT pg_temp.expect('prepare: C4 sessions deleted', (SELECT count(*) FROM auth.sessions WHERE user_id = '00000032-0000-0000-0000-000000000007'), 0);
SELECT pg_temp.expect('prepare: C4 refresh tokens deleted (cascade)', (SELECT count(*) FROM auth.refresh_tokens WHERE user_id = '00000032-0000-0000-0000-000000000007'), 0);
SELECT pg_temp.is('prepare: C4 again -> ready', public.prepare_client_account('client-c4@rls032.test'), 'ready');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000007', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('C4 prepared: client_visible_post_ids() is J', (SELECT count(*) FROM client_visible_post_ids() p WHERE p = '00000032-0000-0000-0000-000000000041'), 1);
SELECT pg_temp.expect('C4 prepared: hiring_posts', (SELECT count(*) FROM hiring_posts), 1);

-- ============================================================
-- C3: client on J and candidate on K
-- ============================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000006', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('C3: client_visible_post_ids() is exactly 1 row', (SELECT count(*) FROM client_visible_post_ids()), 1);
SELECT pg_temp.expect('C3: client_visible_post_ids() is J',             (SELECT count(*) FROM client_visible_post_ids() p WHERE p = '00000032-0000-0000-0000-000000000041'), 1);
-- C3 also reads K's post and application through the candidate policies
-- (020, 022). That is expected: the portal filters every page by
-- client_visible_post_ids(), never by RLS alone.

-- ============================================================
-- A2: staff (admin of O2, marker present) granted on J by email: never a client
-- ============================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000008', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('A2: client_visible_post_ids()',        (SELECT count(*) FROM client_visible_post_ids()), 0);
SELECT pg_temp.expect('A2: client_visible_application_ids()', (SELECT count(*) FROM client_visible_application_ids()), 0);
SELECT pg_temp.expect('A2: client_visible_candidate_ids()',   (SELECT count(*) FROM client_visible_candidate_ids()), 0);
SELECT pg_temp.expect('A2: client_visible_session_ids()',     (SELECT count(*) FROM client_visible_session_ids()), 0);
SELECT pg_temp.expect('A2: client_sessions_for_application(J app)', (SELECT count(*) FROM client_sessions_for_application('00000032-0000-0000-0000-000000000061')), 0);
SELECT pg_temp.expect('A2: hiring_posts J',    (SELECT count(*) FROM hiring_posts WHERE id = '00000032-0000-0000-0000-000000000041'), 0);

-- ============================================================
-- A: admin of O1
-- ============================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('A: hiring_posts J and K',      (SELECT count(*) FROM hiring_posts WHERE org_id = '00000032-0000-0000-0000-000000000021'), 2);
SELECT pg_temp.expect('A: applications J and K',      (SELECT count(*) FROM applications WHERE hiring_post_id IN ('00000032-0000-0000-0000-000000000041', '00000032-0000-0000-0000-000000000042')), 2);
SELECT pg_temp.expect('A: interview_reports J and K', (SELECT count(*) FROM interview_reports WHERE id IN ('00000032-0000-0000-0000-000000000091', '00000032-0000-0000-0000-000000000092')), 2);
SELECT pg_temp.expect('A: grants on J (5 seeded + 1 re-grant)', (SELECT count(*) FROM job_client_access WHERE hiring_post_id = '00000032-0000-0000-0000-000000000041'), 6);
SELECT pg_temp.expect('A: client_visible_post_ids()', (SELECT count(*) FROM client_visible_post_ids()), 0);
SELECT pg_temp.expect('A: INSERT grant on J',
  pg_temp.affected($q$INSERT INTO job_client_access (hiring_post_id, email) VALUES ('00000032-0000-0000-0000-000000000041', 'new-client@rls032.test')$q$), 1);
SELECT pg_temp.expect('A: revoke grant on J',
  pg_temp.affected($q$UPDATE job_client_access SET revoked_at = now() WHERE hiring_post_id = '00000032-0000-0000-0000-000000000041' AND email = 'new-client@rls032.test'$q$), 1);

-- ============================================================
-- R: recruiter of O1 — what 022 allows a recruiter, but no grants
-- ============================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('R: hiring_posts J and K',       (SELECT count(*) FROM hiring_posts WHERE org_id = '00000032-0000-0000-0000-000000000021'), 2);
SELECT pg_temp.expect('R: applications J and K',       (SELECT count(*) FROM applications WHERE hiring_post_id IN ('00000032-0000-0000-0000-000000000041', '00000032-0000-0000-0000-000000000042')), 2);
SELECT pg_temp.expect('R: candidates J and K',         (SELECT count(*) FROM candidates WHERE id IN ('00000032-0000-0000-0000-000000000051', '00000032-0000-0000-0000-000000000052')), 2);
SELECT pg_temp.expect('R: resume_data J and K',        (SELECT count(*) FROM resume_data WHERE application_id IN ('00000032-0000-0000-0000-000000000061', '00000032-0000-0000-0000-000000000062')), 2);
SELECT pg_temp.expect('R: interview_sessions J and K', (SELECT count(*) FROM interview_sessions WHERE id IN ('00000032-0000-0000-0000-000000000071', '00000032-0000-0000-0000-000000000072')), 2);
SELECT pg_temp.expect('R: interview_qa J and K',       (SELECT count(*) FROM interview_qa WHERE id IN ('00000032-0000-0000-0000-000000000081', '00000032-0000-0000-0000-000000000082')), 2);
SELECT pg_temp.expect('R: interview_reports J and K',  (SELECT count(*) FROM interview_reports WHERE id IN ('00000032-0000-0000-0000-000000000091', '00000032-0000-0000-0000-000000000092')), 2);
SELECT pg_temp.expect('R: job_client_access',          (SELECT count(*) FROM job_client_access), 0);
SELECT pg_temp.expect_error('R: INSERT grant on J',
  $q$INSERT INTO job_client_access (hiring_post_id, email) VALUES ('00000032-0000-0000-0000-000000000041', 'r-client@rls032.test')$q$,
  ARRAY['42501']);

-- ============================================================
-- S2: staff of O2 — nothing from O1
-- ============================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000032-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
SELECT pg_temp.expect('S2: hiring_posts O1',       (SELECT count(*) FROM hiring_posts WHERE org_id = '00000032-0000-0000-0000-000000000021'), 0);
SELECT pg_temp.expect('S2: applications O1',       (SELECT count(*) FROM applications WHERE hiring_post_id IN ('00000032-0000-0000-0000-000000000041', '00000032-0000-0000-0000-000000000042')), 0);
SELECT pg_temp.expect('S2: candidates O1',         (SELECT count(*) FROM candidates WHERE id IN ('00000032-0000-0000-0000-000000000051', '00000032-0000-0000-0000-000000000052')), 0);
SELECT pg_temp.expect('S2: resume_data O1',        (SELECT count(*) FROM resume_data WHERE application_id IN ('00000032-0000-0000-0000-000000000061', '00000032-0000-0000-0000-000000000062')), 0);
SELECT pg_temp.expect('S2: interview_sessions O1', (SELECT count(*) FROM interview_sessions WHERE id IN ('00000032-0000-0000-0000-000000000071', '00000032-0000-0000-0000-000000000072')), 0);
SELECT pg_temp.expect('S2: interview_qa O1',       (SELECT count(*) FROM interview_qa WHERE id IN ('00000032-0000-0000-0000-000000000081', '00000032-0000-0000-0000-000000000082')), 0);
SELECT pg_temp.expect('S2: interview_reports O1 (incl. K shared)', (SELECT count(*) FROM interview_reports WHERE id IN ('00000032-0000-0000-0000-000000000091', '00000032-0000-0000-0000-000000000092')), 0);
SELECT pg_temp.expect('S2: job_client_access',     (SELECT count(*) FROM job_client_access), 0);
SELECT pg_temp.expect_error('S2: INSERT grant on J',
  $q$INSERT INTO job_client_access (hiring_post_id, email) VALUES ('00000032-0000-0000-0000-000000000041', 's2-client@rls032.test')$q$,
  ARRAY['42501']);

-- ============================================================
-- Anonymous visitor (/apply and /report/[token])
-- ============================================================
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);

SELECT pg_temp.expect('anon: published J with share_slug', (SELECT count(*) FROM hiring_posts WHERE id = '00000032-0000-0000-0000-000000000041' AND share_slug IS NOT NULL), 1);
SELECT pg_temp.expect('anon: draft K',                     (SELECT count(*) FROM hiring_posts WHERE id = '00000032-0000-0000-0000-000000000042'), 0);
SELECT pg_temp.expect('anon: K shared report by token',    (SELECT count(*) FROM interview_reports WHERE share_token = 'rls032-share-k'), 1);
SELECT pg_temp.expect('anon: J report (not shared)',       (SELECT count(*) FROM interview_reports WHERE id = '00000032-0000-0000-0000-000000000091'), 0);
SELECT pg_temp.expect('anon: client_visible_post_ids()',   (SELECT count(*) FROM client_visible_post_ids()), 0);
-- Privilege, not a call: see the note in the C section.
SELECT pg_temp.expect('anon: client_post_ids_for_user() is not executable',
  (SELECT count(*) FROM (SELECT 1 WHERE has_function_privilege(current_user, 'public.client_post_ids_for_user(uuid)', 'EXECUTE')) x), 0);
SELECT pg_temp.expect('anon: current_user is anon', (SELECT count(*) FROM (SELECT 1 WHERE current_user = 'anon') x), 1);

-- The 023 public insert path.
SELECT pg_temp.expect('anon: INSERT candidates (023 cand_anon_insert)',
  pg_temp.affected($q$INSERT INTO candidates (id, email, full_name) VALUES ('00000032-0000-0000-0000-0000000000b1', 'anon-applicant@rls032.test', 'Anon Applicant')$q$), 1);
-- PRE-EXISTING, NOT CAUSED BY 032: a direct anon INSERT into applications
-- fails with 42P17 "infinite recursion detected in policy for relation
-- applications" (app_anon_insert reads hiring_posts, whose 020
-- hp_candidate_select policy reads applications). It fails identically with
-- 032's policies dropped. Production /apply submits through the backend with
-- the service role, so it is unaffected. This assertion pins the pre-032
-- behaviour; if the recursion is ever fixed, change it to expect 1 row.
SELECT pg_temp.expect_error('anon: INSERT applications on published J (pre-existing recursion, unchanged by 032)',
  $q$INSERT INTO applications (id, hiring_post_id, candidate_id, resume_url, resume_filename) VALUES ('00000032-0000-0000-0000-0000000000b2', '00000032-0000-0000-0000-000000000041', '00000032-0000-0000-0000-0000000000b1', 'resumes/anon.pdf', 'anon.pdf')$q$,
  ARRAY['42P17']);

RESET ROLE;

-- Marker is bound to the invited address: a marked client whose email changes
-- to another granted address must not inherit that grant.
INSERT INTO job_client_access (hiring_post_id, email) VALUES ('00000032-0000-0000-0000-000000000042', 'client-k-only@rls032.test');
UPDATE auth.users SET email = 'client-k-only@rls032.test' WHERE id = '00000032-0000-0000-0000-000000000004';
SELECT pg_temp.expect('email change: C with a moved email gets no posts',
  (SELECT count(*) FROM public.client_post_ids_for_user('00000032-0000-0000-0000-000000000004')), 0);
SELECT pg_temp.is('email change: prepare re-prepares a mismatched marker', public.prepare_client_account('client-k-only@rls032.test'), 'prepared');
SELECT pg_temp.expect('email change: marker now bound to the new address',
  (SELECT count(*) FROM auth.users WHERE id = '00000032-0000-0000-0000-000000000004' AND raw_app_meta_data->>'int_ai_client' = 'client-k-only@rls032.test'), 1);

DO $$ BEGIN RAISE NOTICE 'ALL CHECKS PASSED'; END $$;

ROLLBACK;
