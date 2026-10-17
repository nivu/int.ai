# Feature Specification: Storage Policy Lockdown

**Feature Branch**: `005-storage-policies`
**Created**: 2026-10-18
**Status**: Implemented
**Input**: Production `storage.objects` policies were added by hand, are in no migration, and let any signed-in user read every resume (and anyone read candidate photos). Sign-up is open with auto-confirm, so this is effectively public. Spec 003 invited outside client users, which raises the stakes.

> **Why this spec exists**: the storage policies are the only access control on
> resume, photo, recording and transcript files. They drifted from the repo
> (migration 003 only creates the buckets) and the drifted set is far too wide.
> No browser code reads storage; every read goes through the backend's service
> key. So the read policies can be removed without breaking the app.

## Production state before this change (2026-10-18)

| Bucket | Objects | Policies |
|---|---|---|
| `resumes` | 248 (247 resumes, 1 spec-004 export zip) | `allow_authenticated_read` (SELECT, any bucket, any signed-in user); `allow_public_upload_resumes` (INSERT, anyone, any path) |
| `photos` | 17 | `allow_public_read_photos` (SELECT, anyone); `allow_public_upload_photos` (INSERT, anyone, any path) |
| `recordings` | 0 | `allow_authenticated_upload_recordings` (INSERT, signed-in) + the read above |
| `transcripts` | 0 | `allow_authenticated_upload_transcripts` (INSERT, signed-in) + the read above |

No bucket had a size or type limit.

## How the app uses storage

- **Browser writes**: only the `/apply` form (`file-upload.tsx`), unauthenticated or as a signed-in candidate, with `upsert: false`:
  - resume → `resumes/applications/{hiring_post_id}/{timestamp}_{name}`, `.pdf`/`.docx`, max 5 MB;
  - photo → `photos/candidates/{timestamp}_{name}`, `.jpg`/`.jpeg`/`.png`, max 5 MB.
- **Reads**: only the backend with the service key (resume screening, spec 004 downloads). Service-key access bypasses RLS.
- **Photos** are never displayed. **Recordings and transcripts** are never written.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Signed-in Users Cannot Read Files Directly (Priority: P1)

A user who signs up (or a client from spec 003) calls the storage API directly for
any file. They get "not found", whatever the bucket.

**Acceptance Scenarios**:
1. **Given** any signed-in, non-service user, **When** they download or sign any object in any bucket, **Then** the request fails.
2. **Given** an anonymous caller, **When** they read a photo, **Then** the request fails.

### User Story 2 - Applying Still Works (Priority: P1)

A candidate submits `/apply` with a resume and a photo. Both uploads succeed and the
resume is screened as before.

**Acceptance Scenarios**:
1. **Given** an anonymous caller, **When** they upload a PDF under 5 MB to `resumes/applications/...`, **Then** it succeeds.
2. **Given** an anonymous caller, **When** they upload to `resumes/` outside `applications/`, or a file over 5 MB, or a non-PDF/DOCX file, **Then** it fails.
3. **Given** an anonymous caller, **When** they upload a JPEG/PNG under 5 MB to `photos/candidates/...`, **Then** it succeeds; outside `candidates/` or another type, it fails.

### User Story 3 - Resume Download Keeps Working (Priority: P1)

Staff and granted clients download single resumes and job zips (spec 004) exactly as
before. Export zips live in their own private `exports` bucket.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Migration `033_storage_policies.sql` MUST drop every existing policy on
  `storage.objects` listed above, by name, with `IF EXISTS`.
- **FR-002**: It MUST create exactly two policies, both INSERT-only, `TO anon, authenticated`:
  - `apply_upload_resumes`: `bucket_id = 'resumes'` and first folder `applications`;
  - `apply_upload_photos`: `bucket_id = 'photos'` and first folder `candidates`.

  No SELECT, UPDATE or DELETE policy exists for any role, so only the service key can read, overwrite or delete.
- **FR-003**: It MUST set bucket limits matching the form:
  - `resumes`: 5 MB, `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
  - `photos`: 5 MB, `image/jpeg` and `image/png`.

  `recordings` and `transcripts` stay private with no policies.
- **FR-004**: It MUST create a private bucket `exports` with no policies. Spec 004's
  job zip moves there (`exports/{job_id}/resumes.zip`), because bucket limits apply
  to the service key too and a zip is neither PDF/DOCX nor bounded by 5 MB.
- **FR-005**: The migration MUST be idempotent (`IF EXISTS` / `ON CONFLICT`) so it can
  be applied to a database that already has some of its objects.
- **FR-006**: The old export object `resumes/exports/…` MUST be removed through the
  storage API (not SQL) after deploy.
- **FR-007**: No application behaviour changes other than the export bucket.

## Success Criteria *(mandatory)*

- **SC-001**: `pg_policies` for schema `storage` lists exactly `apply_upload_resumes` and `apply_upload_photos`.
- **SC-002**: After deploy, with the anon key: a PDF upload to `resumes/applications/<test>/…` succeeds; an upload to `resumes/exports/…` and a `.txt` upload fail; reading any resume or photo fails. With a signed-in non-service user, reading any resume fails. Test objects are removed afterwards.
- **SC-003**: A spec 004 job export succeeds and writes to the `exports` bucket.

## Assumptions

- The project's global upload limit (50 MB) bounds `exports`.
- Existing objects are not affected by new bucket limits (limits apply on upload).

## Out of Scope

- Displaying candidate photos, or any recording/transcript storage.
- Rate limiting anonymous uploads.
- Orphaned uploads from abandoned `/apply` forms.
