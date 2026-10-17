-- 033_storage_policies.sql
-- Replace the hand-added, never-migrated storage policies with a minimal set.
-- See specs/005-storage-policies/spec.md.
--
-- Before: any signed-in user could read every object in every bucket, anyone
-- could read photos, and anyone could upload anything anywhere in resumes and
-- photos. No browser code reads storage (the backend uses the service key), so
-- the only browser access kept is the /apply form's anonymous upload, limited
-- to its own folder, size and file types.

-- Drop the drifted policies.
DROP POLICY IF EXISTS allow_authenticated_read ON storage.objects;
DROP POLICY IF EXISTS allow_public_read_photos ON storage.objects;
DROP POLICY IF EXISTS allow_public_upload_photos ON storage.objects;
DROP POLICY IF EXISTS allow_public_upload_resumes ON storage.objects;
DROP POLICY IF EXISTS allow_authenticated_upload_recordings ON storage.objects;
DROP POLICY IF EXISTS allow_authenticated_upload_transcripts ON storage.objects;

-- /apply uploads: insert only, into the form's own folders.
DROP POLICY IF EXISTS apply_upload_resumes ON storage.objects;
CREATE POLICY apply_upload_resumes ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = 'applications'
    );

DROP POLICY IF EXISTS apply_upload_photos ON storage.objects;
CREATE POLICY apply_upload_photos ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        bucket_id = 'photos'
        AND (storage.foldername(name))[1] = 'candidates'
    );

-- Bucket limits matching the /apply form (5 MB; PDF/DOCX resumes, JPEG/PNG photos).
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id = 'resumes';

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png']
WHERE id = 'photos';

-- Private bucket for spec 004 job zips; no policies, service key only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;
