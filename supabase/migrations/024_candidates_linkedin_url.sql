-- Add linkedin_url column to candidates
-- Captured on the public application form so recruiters can open a
-- candidate's LinkedIn profile from the Candidate Management Table.
ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS linkedin_url text;
