-- 009_auto_screen_on_application_insert.sql
-- Fire resume screening at the database level as soon as an application row
-- is created, regardless of how the row was inserted (API, admin dashboard,
-- direct DB write, etc.).
--
-- Uses pg_net (bundled with Supabase) to POST an async HTTP request to the
-- backend webhook. The call is non-blocking — the INSERT transaction commits
-- immediately and the HTTP request is dispatched in the background.
--
-- Backend URL configuration (run once per environment):
--   ALTER DATABASE postgres SET app.backend_url = 'http://host.docker.internal:8000'; -- local dev
--   ALTER DATABASE postgres SET app.backend_url = 'https://your-backend.example.com'; -- production

CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

CREATE OR REPLACE FUNCTION auto_trigger_screening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  backend_url text;
BEGIN
  backend_url := coalesce(
    current_setting('app.backend_url', true),
    'http://localhost:8000'
  );

  PERFORM net.http_post(
    url     := backend_url || '/api/v1/webhooks/application-created',
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'applications',
                 'record', jsonb_build_object(
                             'id',             NEW.id,
                             'hiring_post_id', NEW.hiring_post_id,
                             'candidate_id',   NEW.candidate_id
                           )
               ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_screen_on_application_insert
  AFTER INSERT ON applications
  FOR EACH ROW
  EXECUTE FUNCTION auto_trigger_screening();
