-- 027_screening_failure_columns.sql
--
-- When resume screening crashes, screen_resume_task resets the application to
-- 'applied' so it can be retried. Until now nothing recorded that it had
-- failed, so a crashed screening looked exactly like one that never started.
-- These columns keep the last failure so the dashboard's "Needs attention"
-- list and the hourly pipeline alert can show it.
--
-- Written only by the backend (service role). The backend tolerates these
-- columns being absent, so code can deploy before this migration is applied.

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS screening_error     text,
    ADD COLUMN IF NOT EXISTS screening_failed_at timestamptz;
