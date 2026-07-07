-- Add custom_questions column to interview_templates
-- Allows recruiters to define specific questions to be asked during AI interviews
ALTER TABLE interview_templates
    ADD COLUMN IF NOT EXISTS custom_questions text[] DEFAULT '{}';
