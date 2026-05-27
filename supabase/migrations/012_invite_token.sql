-- Add invite_token to interview_sessions so candidates can access their
-- interview directly from the invite email link without an OTP flow.
ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS invite_token uuid DEFAULT gen_random_uuid() NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_sessions_invite_token
  ON interview_sessions(invite_token);
