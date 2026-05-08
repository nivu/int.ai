-- 008_auto_interview_session_trigger.sql
-- Two fixes:
-- 1. Auto-create interview_session when application status → interview_sent/interview_invited
-- 2. Auto-link candidates.auth_user_id when a Supabase user signs up with a matching email

-- ============================================================
-- 1. Auto-create interview session on status change
-- ============================================================
CREATE OR REPLACE FUNCTION auto_create_interview_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as the function owner (postgres), bypasses RLS
AS $$
BEGIN
    -- Only act when status changes INTO an interview-invited state
    IF NEW.status IN ('interview_sent', 'interview_invited')
       AND (OLD.status IS NULL OR OLD.status NOT IN ('interview_sent', 'interview_invited'))
    THEN
        -- Only insert if no pending session already exists for this application
        INSERT INTO interview_sessions (application_id, template_id, status, deadline)
        SELECT
            NEW.id,
            hp.interview_template_id,
            'pending',
            COALESCE(NEW.interview_deadline, now() + interval '7 days')
        FROM hiring_posts hp
        WHERE hp.id = NEW.hiring_post_id
          AND hp.interview_template_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM interview_sessions s
              WHERE s.application_id = NEW.id
                AND s.status = 'pending'
          );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_interview_session
    AFTER UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_interview_session();

-- ============================================================
-- 2. Auto-link auth_user_id when a candidate signs up
-- ============================================================
CREATE OR REPLACE FUNCTION link_candidate_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.candidates
    SET auth_user_id = NEW.id
    WHERE email = LOWER(NEW.email)
      AND auth_user_id IS NULL;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_candidate_auth_user
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION link_candidate_auth_user();

-- ============================================================
-- Backfill: link auth_user_id for existing signed-up candidates
-- ============================================================
UPDATE public.candidates c
SET auth_user_id = u.id
FROM auth.users u
WHERE LOWER(u.email) = LOWER(c.email)
  AND c.auth_user_id IS NULL;

-- ============================================================
-- Backfill: create sessions for existing interview_sent applications
-- that are missing a pending session
-- ============================================================
INSERT INTO interview_sessions (application_id, template_id, status, deadline)
SELECT
    a.id,
    hp.interview_template_id,
    'pending',
    COALESCE(a.interview_deadline, now() + interval '7 days')
FROM applications a
JOIN hiring_posts hp ON hp.id = a.hiring_post_id
WHERE a.status IN ('interview_sent', 'interview_invited')
  AND hp.interview_template_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM interview_sessions s
      WHERE s.application_id = a.id
  );
