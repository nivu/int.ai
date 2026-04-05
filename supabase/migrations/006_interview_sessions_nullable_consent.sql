-- Make consent_given_at nullable so sessions can be created before candidate consents
ALTER TABLE interview_sessions ALTER COLUMN consent_given_at DROP NOT NULL;

-- Add deadline column for interview expiry
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS deadline timestamptz;
