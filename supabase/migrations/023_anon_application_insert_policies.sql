-- 023_anon_application_insert_policies.sql
--
-- Captures two RLS policies that exist in production but in no migration.
-- Found on 2026-09-03 by running specs/002-multi-org-isolation/verify-022.sql,
-- which reported them as present-in-DB-but-undeclared.
--
-- These are load-bearing for candidate acquisition. The public /apply page
-- submits with the anon key and performs two inserts: first a candidates row,
-- then an applications row referencing it. Without these policies both inserts
-- are rejected by RLS and the form fails outright.
--
-- Because they were never committed, a rebuild from supabase/migrations/ —
-- a fresh staging environment, a new developer, a restore — produced a database
-- where nobody could apply for a job. This migration closes that gap.
--
-- Definitions transcribed verbatim from pg_policies on production; see the spec
-- for the query. Idempotent.

-- ============================================================
-- candidates: allow the public apply form to create a candidate
--
-- WITH CHECK (true) is intentionally unconditional. The candidate row is
-- created BEFORE the application that would scope it to a published post, so
-- at insert time there is nothing to validate against.
--
-- ⚠️  This means anyone holding the anon key — which ships to the browser by
-- design — can insert arbitrary rows into `candidates`. That is an accepted
-- trade-off for an open application form, not an oversight, but it is an
-- unrated abuse vector: there is no rate limiting or CAPTCHA in front of it.
-- Worth revisiting if the table ever sees spam. Tightening it requires
-- reordering the insert flow, so it is deliberately left as-is here — this
-- migration records reality, it does not change it.
-- ============================================================

DROP POLICY IF EXISTS "cand_anon_insert" ON candidates;
CREATE POLICY "cand_anon_insert" ON candidates
    FOR INSERT
    TO public
    WITH CHECK (true);

-- ============================================================
-- applications: allow the public apply form to create an application,
-- but only against a published hiring post.
--
-- This one IS scoped: an anonymous caller cannot attach an application to a
-- draft, closed or archived post.
-- ============================================================

DROP POLICY IF EXISTS "app_anon_insert" ON applications;
CREATE POLICY "app_anon_insert" ON applications
    FOR INSERT
    TO public
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM hiring_posts
            WHERE hiring_posts.id = applications.hiring_post_id
              AND hiring_posts.status = 'published'::text
        )
    );
