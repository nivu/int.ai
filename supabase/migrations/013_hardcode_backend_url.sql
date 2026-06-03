-- 013_hardcode_backend_url.sql
-- Replace the dynamic app.backend_url setting with a hardcoded production URL.
-- The previous approach required superuser access to set the database parameter,
-- which is not available on Supabase's hosted platform.

CREATE OR REPLACE FUNCTION auto_trigger_screening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://intai-production.up.railway.app/api/v1/webhooks/application-created',
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
