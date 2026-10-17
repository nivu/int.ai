-- Verify migration 032 (client job access) against the live database.
--
-- READ-ONLY. Every statement below is a SELECT against system catalogs.
-- It changes nothing and is safe to run against production.
--
-- Run this in the Supabase SQL editor after `supabase db push` and read the
-- `status` column.
--
--   OK          032 matches the database for that check
--   MISSING     032 claims something the database does not have
--   UNEXPECTED  the database has something 032 forbids
--
-- Any row that is not OK means migration 032 is missing or has drifted.
-- Checks 6 and 7 return rows only when something is wrong.
--
-- Spec: specs/003-client-job-access/spec.md

-- 1. The seven SECURITY DEFINER functions, with search_path pinned.
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
  AND p.proname IN ('client_post_ids_for_user', 'client_visible_post_ids',
                    'client_visible_application_ids', 'client_visible_candidate_ids',
                    'client_visible_session_ids', 'client_sessions_for_application',
                    'prepare_client_account')

UNION ALL
-- Any of the seven that do not exist at all.
SELECT '1-functions', expected, 'MISSING'
FROM unnest(ARRAY['client_post_ids_for_user', 'client_visible_post_ids',
                  'client_visible_application_ids', 'client_visible_candidate_ids',
                  'client_visible_session_ids', 'client_sessions_for_application',
                  'prepare_client_account']) AS expected
WHERE expected NOT IN (
    SELECT p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
)

UNION ALL
-- 2. The eligibility function is service_role only. If anon or authenticated
--    could call it, any user could probe any other user's grants.
SELECT '2-execute', 'client_post_ids_for_user(' || r.rolname || ')',
    CASE
        WHEN to_regprocedure('public.client_post_ids_for_user(uuid)') IS NULL THEN 'MISSING'
        WHEN has_function_privilege(r.rolname, 'public.client_post_ids_for_user(uuid)', 'EXECUTE') = r.allowed
            THEN 'OK'
        WHEN r.allowed THEN 'MISSING: service_role cannot execute'
        ELSE 'UNEXPECTED: ' || r.rolname || ' can execute'
    END
FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(rolname, allowed)

UNION ALL
-- prepare_client_account marks an account as a client and replaces its
-- password. If anon or authenticated could call it, anyone could lock any
-- non-staff user out of their password and end their sessions.
SELECT '2-execute', 'prepare_client_account(' || r.rolname || ')',
    CASE
        WHEN to_regprocedure('public.prepare_client_account(text)') IS NULL THEN 'MISSING'
        WHEN has_function_privilege(r.rolname, 'public.prepare_client_account(text)', 'EXECUTE') = r.allowed
            THEN 'OK'
        WHEN r.allowed THEN 'MISSING: service_role cannot execute'
        ELSE 'UNEXPECTED: ' || r.rolname || ' can execute'
    END
FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(rolname, allowed)

UNION ALL
-- prepare_client_account runs as its owner and writes to auth tables it does
-- not own. Postgres only checks those privileges (and the pgcrypto calls)
-- when the function runs, so a gap would surface as a 502 on the first invite
-- of an existing account. Run this before the first real invite.
SELECT '2-execute', 'prepare_client_account owner: ' || x.what,
    CASE
        WHEN f.oid IS NULL THEN 'MISSING'
        WHEN x.ok THEN 'OK'
        ELSE 'MISSING: ' || x.what
    END
FROM (SELECT to_regprocedure('public.prepare_client_account(text)') AS oid) f
LEFT JOIN pg_proc p ON p.oid = f.oid
CROSS JOIN LATERAL (VALUES
    ('UPDATE auth.users',        coalesce(has_table_privilege(p.proowner, 'auth.users', 'UPDATE'), false)),
    ('DELETE auth.sessions',     coalesce(has_table_privilege(p.proowner, 'auth.sessions', 'DELETE'), false)),
    ('DELETE auth.identities',   coalesce(has_table_privilege(p.proowner, 'auth.identities', 'DELETE'), false)),
    ('DELETE auth.mfa_factors',  coalesce(has_table_privilege(p.proowner, 'auth.mfa_factors', 'DELETE'), false)),
    ('extensions.crypt',         to_regprocedure('extensions.crypt(text,text)') IS NOT NULL),
    ('extensions.gen_salt',      to_regprocedure('extensions.gen_salt(text,integer)') IS NOT NULL),
    ('extensions.gen_random_bytes', to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL)
) AS x(what, ok)

UNION ALL
-- 3. The grant table: exists with RLS on, the active-grant unique index, and
--    invited_by set to NULL (not cascaded) when the team member is deleted.
SELECT '3-table', 'job_client_access',
    CASE
        WHEN c.oid IS NULL           THEN 'MISSING'
        WHEN NOT c.relrowsecurity    THEN 'UNEXPECTED: RLS not enabled'
        ELSE 'OK'
    END
FROM (SELECT to_regclass('public.job_client_access') AS oid) t
LEFT JOIN pg_class c ON c.oid = t.oid

UNION ALL
SELECT '3-table', 'job_client_access_active_uq',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'job_client_access'
          AND indexname = 'job_client_access_active_uq'
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
          AND indexdef LIKE '%WHERE (revoked_at IS NULL)%'
    ) THEN 'OK' ELSE 'MISSING' END

UNION ALL
SELECT '3-table', 'job_client_access.invited_by ON DELETE SET NULL',
    CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_constraint con
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
            WHERE con.conrelid = to_regclass('public.job_client_access')
              AND con.contype = 'f' AND a.attname = 'invited_by'
        ) THEN 'MISSING'
        WHEN EXISTS (
            SELECT 1 FROM pg_constraint con
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
            WHERE con.conrelid = to_regclass('public.job_client_access')
              AND con.contype = 'f' AND a.attname = 'invited_by'
              AND con.confdeltype = 'n'
        ) THEN 'OK'
        ELSE 'UNEXPECTED: invited_by foreign key is not ON DELETE SET NULL'
    END

UNION ALL
-- 4. The seven policies 032 creates, with the right command and roles.
SELECT '4-policies', e.tbl || '.' || e.pol,
    CASE
        WHEN p.policyname IS NULL           THEN 'MISSING'
        WHEN p.cmd <> e.cmd                 THEN 'UNEXPECTED: cmd is ' || p.cmd
        WHEN p.roles <> '{authenticated}'::name[]
                                            THEN 'UNEXPECTED: roles are ' || p.roles::text
        ELSE 'OK'
    END
FROM (VALUES
    ('job_client_access', 'jca_admin_all',     'ALL'),
    ('hiring_posts',      'hp_client_select',  'SELECT'),
    ('applications',      'app_client_select', 'SELECT'),
    ('candidates',        'cand_client_select','SELECT'),
    ('resume_data',       'rd_client_select',  'SELECT'),
    ('interview_qa',      'iqa_client_select', 'SELECT'),
    ('interview_reports', 'ir_client_select',  'SELECT')
) AS e(tbl, pol, cmd)
LEFT JOIN pg_policies p
  ON p.schemaname = 'public' AND p.tablename = e.tbl AND p.policyname = e.pol

UNION ALL
-- 5. Shared reports are for the sessionless /report/[token] page only. Without
--    the guard any signed-in user can read every shared report in every org.
SELECT '5-share-guard', 'interview_reports.ir_anon_share_select',
    CASE
        WHEN qual IS NULL                 THEN 'MISSING'
        WHEN qual LIKE '%uid() IS NULL%'  THEN 'OK'
        ELSE 'UNEXPECTED: no auth.uid() IS NULL guard — shared reports readable by signed-in users'
    END
FROM (SELECT 1) one
LEFT JOIN pg_policies
  ON schemaname = 'public' AND tablename = 'interview_reports'
 AND policyname = 'ir_anon_share_select'

UNION ALL
-- 6. interview_sessions holds bearer tokens (invite_token, reconnection_token).
--    No policy on it may grant anything to clients.
SELECT '6-sessions', 'interview_sessions.' || policyname,
       'UNEXPECTED: policy references client_ functions — session tokens exposed'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'interview_sessions'
  AND (coalesce(qual, '') LIKE '%client_%' OR coalesce(with_check, '') LIKE '%client_%')

UNION ALL
-- 7. Clients are read-only. No write-capable policy may carry a client name,
--    other than the admin-only policy on the grant table itself.
SELECT '7-client-writes', tablename || '.' || policyname,
       'UNEXPECTED: ' || cmd || ' policy for clients'
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%client%'
  AND cmd <> 'SELECT'
  AND NOT (tablename = 'job_client_access' AND policyname = 'jca_admin_all')

ORDER BY 1, 3 DESC, 2;
