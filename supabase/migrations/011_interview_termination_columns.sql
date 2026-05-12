-- 011_interview_termination_columns.sql
-- Adds terminated status values, termination metadata, dimension_averages,
-- per_dimension_reasoning, and candidate_email_body.

-- ── interview_sessions ───────────────────────────────────────────────────────
-- Widen the status check constraint to include terminated states.
ALTER TABLE interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_status_check;

ALTER TABLE interview_sessions
  ADD CONSTRAINT interview_sessions_status_check
    CHECK (status IN (
      'pending',
      'in_progress',
      'completed',
      'disconnected',
      'expired',
      'terminated_tab_switch',
      'terminated_abandoned'
    ));

-- Store which question the session was on when it was terminated, and how much
-- of the silence timer remained at that moment.
ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS terminated_at_question integer,
  ADD COLUMN IF NOT EXISTS timer_remaining_at_termination real;

-- ── interview_qa ─────────────────────────────────────────────────────────────
-- Per-dimension reasoning from the o1-mini scoring call, stored as JSON:
-- {"technical_accuracy": "...", "depth_of_understanding": "...", ...}
ALTER TABLE interview_qa
  ADD COLUMN IF NOT EXISTS per_dimension_reasoning jsonb;

-- ── interview_reports ────────────────────────────────────────────────────────
-- Dimension averages used for the radar chart in the recruiter UI.
ALTER TABLE interview_reports
  ADD COLUMN IF NOT EXISTS dimension_averages jsonb;

-- LLM-generated candidate-facing email body (plain text), produced by the
-- synthesis step and sent in the post-interview email.
ALTER TABLE interview_reports
  ADD COLUMN IF NOT EXISTS candidate_email_body text;
