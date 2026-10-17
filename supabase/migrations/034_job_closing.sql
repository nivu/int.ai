-- 034_job_closing.sql
-- Enforce hiring_posts.closes_at. See specs/006-job-closing/spec.md.
--
-- 1. public_job_status(slug): lets the public apply page say "closed" with the
--    job title, without letting anonymous visitors read closed jobs' rows.
-- 2. Schedule auto_close_expired_posts() (migration 005), which was never run.

CREATE OR REPLACE FUNCTION public.public_job_status(p_slug text)
RETURNS TABLE (title text, is_open boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT hp.title,
           hp.status = 'published' AND (hp.closes_at IS NULL OR hp.closes_at >= now())
    FROM hiring_posts hp
    WHERE hp.share_slug = p_slug
      AND hp.status IN ('published', 'closed', 'archived');
$$;

REVOKE ALL ON FUNCTION public.public_job_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_job_status(text) TO anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'auto-close-expired-posts';
SELECT cron.schedule(
    'auto-close-expired-posts',
    '*/15 * * * *',
    'SELECT public.auto_close_expired_posts()'
);
