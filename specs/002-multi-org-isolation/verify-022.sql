-- Verify migration 022 against the live database.
--
-- READ-ONLY. Every statement below is a SELECT against system catalogs.
-- It changes nothing and is safe to run against production.
--
-- Why this exists: the multi-org RLS model was applied by hand in the Supabase
-- SQL editor on 2026-07-04 and never committed. Migration 022 reconstructs it
-- from that session's log, not from the database itself, so it has never been
-- checked against reality. Run this in the Supabase SQL editor and read the
-- `status` column.
--
--   OK       022 matches the database for that check
--   MISSING  022 claims something the database does not have
--   UNEXPECTED  the database has something 022 would undo
--
-- Any row that is not OK means the migrations and the database have drifted.
--
-- BASELINE: run against production 2026-09-03 after the corrections in
-- migrations 022 and 023. Result: 40 rows, every one OK, and check 6 returned
-- no rows at all — no policy exists in the database that the migrations do not
-- declare. Migrations and production agree.
--
-- That is the known-good state. Any row that is not OK, or any row appearing
-- under check 6, is drift introduced since.
--
-- Expectations below include policies from migrations 019, 020 and 023, not
-- only 022 — this is a drift check for the whole RLS surface.

-- 1. The five SECURITY DEFINER functions, with search_path pinned.
SELECT
    '1-functions'                                     AS check,
    p.proname                                         AS object,
    CASE
        WHEN NOT p.prosecdef                     THEN 'UNEXPECTED: not SECURITY DEFINER'
        WHEN p.proconfig IS NULL
          OR NOT ('search_path=public' = ANY(p.proconfig))
                                                 THEN 'UNEXPECTED: search_path not pinned to public'
        ELSE 'OK'
    END                                               AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_org_admin', 'is_org_member',
                    'can_staff_see_application', 'can_staff_see_candidate',
                    'can_staff_see_session')

UNION ALL
-- Any of the five that do not exist at all.
SELECT '1-functions', expected, 'MISSING'
FROM unnest(ARRAY['is_org_admin', 'is_org_member',
                  'can_staff_see_application', 'can_staff_see_candidate',
                  'can_staff_see_session']) AS expected
WHERE expected NOT IN (
    SELECT p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
)

UNION ALL
-- 2. The duplicate-session trigger must be gone. Migration 008 creates it;
--    the July fix dropped it. If it is back, sessions are being double-created.
SELECT
    '2-trigger',
    'trg_auto_create_interview_session',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_auto_create_interview_session' AND NOT tgisinternal
    ) THEN 'UNEXPECTED: trigger still present — duplicate interview sessions'
      ELSE 'OK' END

UNION ALL
-- 3. Columns the evaluator writes. Missing ones make its insert fail silently,
--    leaving sessions marked completed with no report.
SELECT '3-columns', c.expected,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interview_reports'
          AND column_name = c.expected
    ) THEN 'OK' ELSE 'MISSING' END
FROM unnest(ARRAY['notable_responses', 'recommendation_detail',
                  'dimension_averages', 'candidate_email_body',
                  'share_token', 'share_expires_at']) AS c(expected)

UNION ALL
-- 4. Policies 022 expects to exist, by table.
SELECT '4-policies', e.tbl || '.' || e.pol,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = e.tbl AND policyname = e.pol
    ) THEN 'OK' ELSE 'MISSING' END
FROM (VALUES
    ('organizations','org_admin_all'), ('organizations','org_recruiter_select'),
    ('team_members','tm_self_select'), ('team_members','tm_admin_all'),
    ('interview_templates','it_admin_all'), ('interview_templates','it_recruiter_all'),
    ('hiring_posts','hp_admin_all'), ('hiring_posts','hp_recruiter_all'),
    ('hiring_posts','hp_anon_published_select'), ('hiring_posts','hp_candidate_select'),
    ('applications','app_anon_insert'), ('candidates','cand_anon_insert'),
    ('applications','app_admin_all'), ('applications','app_recruiter_select'),
    ('applications','app_candidate_select'),
    ('candidates','cand_staff_select'), ('candidates','cand_self_select'),
    ('resume_data','rd_staff_select'),
    ('interview_sessions','is_staff_select'), ('interview_sessions','is_admin_insert'),
    ('interview_sessions','is_candidate_select'), ('interview_sessions','is_candidate_update'),
    ('interview_qa','iqa_staff_select'),
    ('interview_reports','ir_staff_select'), ('interview_reports','ir_anon_share_select'),
    ('invite_tokens','it_admin_all'), ('invite_tokens','it_self_select')
) AS e(tbl, pol)

UNION ALL
-- 5. The cross-org leak guard. This policy was the one letting authenticated
--    users of one org see another org's published posts; it must assert
--    auth.uid() IS NULL so it only serves the anonymous /apply page.
SELECT '5-anon-guard', 'hiring_posts.hp_anon_published_select',
    CASE
        WHEN qual IS NULL              THEN 'MISSING'
        WHEN qual LIKE '%uid() IS NULL%' THEN 'OK'
        ELSE 'UNEXPECTED: no auth.uid() IS NULL guard — cross-org leak'
    END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'hiring_posts'
  AND policyname = 'hp_anon_published_select'

UNION ALL
-- 6. Policies the database has on these tables that 022 does not mention.
--    Applying 022 would leave these in place; they may be stale or may be
--    load-bearing additions made after July.
SELECT '6-undeclared', tablename || '.' || policyname,
       'UNEXPECTED: present in DB, absent from 022'
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organizations','team_members','interview_templates',
                    'hiring_posts','applications','candidates','resume_data',
                    'interview_sessions','interview_qa','interview_reports',
                    'invite_tokens')
  AND (tablename, policyname) NOT IN (VALUES
    ('organizations','org_admin_all'), ('organizations','org_recruiter_select'),
    ('team_members','tm_self_select'), ('team_members','tm_admin_all'),
    ('interview_templates','it_admin_all'), ('interview_templates','it_recruiter_all'),
    ('hiring_posts','hp_admin_all'), ('hiring_posts','hp_recruiter_all'),
    ('hiring_posts','hp_anon_published_select'), ('hiring_posts','hp_candidate_select'),
    ('applications','app_anon_insert'), ('candidates','cand_anon_insert'),
    ('applications','app_admin_all'), ('applications','app_recruiter_select'),
    ('applications','app_candidate_select'),
    ('candidates','cand_staff_select'), ('candidates','cand_self_select'),
    ('resume_data','rd_staff_select'),
    ('interview_sessions','is_staff_select'), ('interview_sessions','is_admin_insert'),
    ('interview_sessions','is_candidate_select'), ('interview_sessions','is_candidate_update'),
    ('interview_qa','iqa_staff_select'),
    ('interview_reports','ir_staff_select'), ('interview_reports','ir_anon_share_select'),
    ('invite_tokens','it_admin_all'), ('invite_tokens','it_self_select')
  )

ORDER BY 1, 3 DESC, 2;
