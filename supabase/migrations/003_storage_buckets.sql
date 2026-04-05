-- 003_storage_buckets.sql
-- Create private storage buckets for file uploads

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('resumes', 'resumes', false),
    ('photos', 'photos', false),
    ('recordings', 'recordings', false),
    ('transcripts', 'transcripts', false);
