-- 025_api_keys.sql
--
-- Long-lived API keys for the hosted MCP server (backend /mcp endpoint).
-- Each key belongs to one team member and acts within that member's org.
-- Only the SHA-256 hash of the key is stored; the raw key is shown once at
-- creation time. Revocation is a soft delete via revoked_at.
--
-- RLS is enabled with NO policies on purpose: the table is read and written
-- exclusively by the backend through the service-role client. The browser
-- never touches it directly.

CREATE TABLE IF NOT EXISTS api_keys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id),
    team_member_id  uuid NOT NULL REFERENCES team_members(id),
    name            text NOT NULL,
    key_prefix      text NOT NULL,
    key_hash        text NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_used_at    timestamptz,
    revoked_at      timestamptz
);

CREATE INDEX IF NOT EXISTS api_keys_org_id_idx ON api_keys (org_id);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
