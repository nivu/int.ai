-- 026_ai_usage.sql
--
-- One row per billable AI/voice call: OpenAI chat + embeddings, Deepgram
-- speech-to-text seconds and text-to-speech characters, LiveKit agent
-- session minutes. Written only by the backend (service role); read by the
-- Settings → Usage tab and the MCP get_usage tool through the backend.
--
-- cost_usd is an estimate computed at write time from the price table in
-- backend/app/services/usage.py, so historical rows keep the price that
-- applied when they were written.

CREATE TABLE IF NOT EXISTS ai_usage (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               uuid REFERENCES organizations(id),
    hiring_post_id       uuid REFERENCES hiring_posts(id),
    application_id       uuid REFERENCES applications(id),
    interview_session_id uuid REFERENCES interview_sessions(id),
    provider             text NOT NULL,          -- openai | deepgram | livekit
    model                text NOT NULL,          -- gpt-4o-mini, nova-2, agent-session, ...
    operation            text NOT NULL,          -- parse_resume, score_resume, interview_llm, stt, tts, ...
    input_tokens         integer NOT NULL DEFAULT 0,
    output_tokens        integer NOT NULL DEFAULT 0,
    duration_seconds     real    NOT NULL DEFAULT 0, -- audio / session seconds
    characters           integer NOT NULL DEFAULT 0, -- TTS characters
    cost_usd             numeric(12, 6) NOT NULL DEFAULT 0,
    latency_ms           real,
    status               text NOT NULL DEFAULT 'success', -- success | error
    error                text,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_org_created_idx ON ai_usage (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_provider_idx ON ai_usage (provider, operation);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
