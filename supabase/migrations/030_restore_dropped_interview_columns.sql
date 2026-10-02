-- Migrations 011 and 012 added these columns and production records both as
-- applied, but they were missing from production (found 2026-10-02 by
-- comparing a fresh replay with a production schema dump). The code writes
-- them, so every write failed:
--   - interview_qa.per_dimension_reasoning: the evaluator's per-question score
--     update failed, so no completed interview was scored or reported;
--   - interview_sessions.invite_token: invite links carried no token;
--   - terminated_at_question / timer_remaining_at_termination: tab-switch
--     terminations were not recorded.
-- Restored with the original definitions. IF NOT EXISTS keeps this safe on
-- databases that still have them.

ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS invite_token uuid DEFAULT gen_random_uuid() NOT NULL,
    ADD COLUMN IF NOT EXISTS terminated_at_question integer,
    ADD COLUMN IF NOT EXISTS timer_remaining_at_termination real;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_sessions_invite_token
    ON interview_sessions(invite_token);

ALTER TABLE interview_qa
    ADD COLUMN IF NOT EXISTS per_dimension_reasoning jsonb;

-- Production stores 1536-dimension embeddings (text-embedding-3-small, see
-- backend/app/services/embeddings.py) but the migrations declared 384. Align
-- fresh databases; a no-op where the column is already 1536.
--
-- The check compares the dimension (pgvector stores it as the typmod), not
-- format_type() text: the original version of this file compared against
-- 'vector(1536)', production reports 'extensions.vector(1536)', and the
-- USING NULL rewrite cleared every stored embedding there on 2026-10-02
-- (restored by backend/scripts/data/restore_resume_embeddings.py).
DO $$
BEGIN
    IF (SELECT atttypmod FROM pg_attribute
        WHERE attrelid = 'resume_data'::regclass AND attname = 'embedding') <> 1536
    THEN
        ALTER TABLE resume_data ALTER COLUMN embedding TYPE extensions.vector(1536) USING NULL;
    END IF;
END;
$$;
