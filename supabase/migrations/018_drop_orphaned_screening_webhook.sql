-- auto_trigger_screening() and app_config were the original app_config-driven
-- webhook dispatcher (009/013/016_*.sql). At some point, outside of any
-- migration, the trg_auto_screen_on_application_insert trigger was
-- reassigned to a different function (auto_screen_on_application_insert(),
-- which just inserts a placeholder resume_data row) — leaving
-- auto_trigger_screening() attached to no trigger at all. The actual webhook
-- dispatch now happens via a native Supabase Database Webhook
-- ("application-created", configured in the Dashboard, hardcoded to the
-- Railway URL), independent of app_config. Removing the dead function and
-- the now-unused config table.

DROP FUNCTION IF EXISTS auto_trigger_screening();
DROP TABLE IF EXISTS app_config;
