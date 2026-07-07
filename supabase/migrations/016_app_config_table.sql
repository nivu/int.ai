-- Replace hardcoded backend URL with a config table so it can be updated
-- without superuser access.

CREATE TABLE IF NOT EXISTS app_config (
    key   text PRIMARY KEY,
    value text NOT NULL
);

-- Seed with production URL (safe default)
INSERT INTO app_config (key, value)
VALUES ('backend_url', 'https://intai-production.up.railway.app')
ON CONFLICT (key) DO NOTHING;

-- Rewrite trigger to read URL from config table
CREATE OR REPLACE FUNCTION auto_trigger_screening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  backend_url text;
BEGIN
  SELECT value INTO backend_url FROM app_config WHERE key = 'backend_url';
  backend_url := coalesce(backend_url, 'https://intai-production.up.railway.app');

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
