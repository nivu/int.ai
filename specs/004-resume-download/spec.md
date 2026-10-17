# Feature Specification: Resume Download

**Feature Branch**: `004-resume-download`
**Created**: 2026-10-18
**Status**: Draft
**Input**: Staff and invited clients (spec 003) can see a candidate's resume analysis but cannot get the original resume file. A client (Fluxbooks) needs the files to run their own assessment round, and staff have no download either.

> **Why this spec exists**: spec 003 put resume download out of scope because the
> production `storage.objects` policies are drifted and unverified. This feature
> does not rely on them. The backend checks who is asking, reads the file with the
> service key, and hands back a short-lived signed link. No storage policy is added
> or changed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download One Resume (Priority: P1)

On a candidate's page, a staff member (admin portal) or an invited client (`/client`
portal) clicks "Download resume". The browser downloads the original file the
candidate uploaded, under the candidate's original filename.

**Independent Test**: As staff of org O, open a candidate of a job in O and click
"Download resume"; the original PDF/DOCX downloads. As a client granted job J, do
the same for a candidate of J; it downloads. A client calling the endpoint for an
application of another job gets 403.

**Acceptance Scenarios**:
1. **Given** an active team member of the job's org, **When** they request the resume of an application on that job, **Then** they receive a signed link valid for 5 minutes.
2. **Given** a client with an active grant on job J, **When** they request the resume of an application on J, **Then** they receive a signed link valid for 5 minutes.
3. **Given** a client without a grant on the application's job, a revoked client, staff of another org, or any other signed-in user, **When** they request it, **Then** they receive 403.
4. **Given** an application with no stored resume, or whose file is missing from storage, **When** it is requested, **Then** the API returns 404 and the button shows "Resume not available".

### User Story 2 - Download All Resumes for a Job (Priority: P2)

On a job page, staff or a granted client clicks "Download all resumes". The browser
downloads one zip containing every candidate's resume for that job.

**Independent Test**: For a job with N applications that each have a stored resume,
the downloaded zip contains N files, each named after the candidate.

**Acceptance Scenarios**:
1. **Given** a job with N applications with stored resumes, **When** an allowed user clicks "Download all resumes", **Then** the zip contains N files and the response reports `included = N`, `skipped = 0`.
2. **Given** some applications have no resume or a missing file, **When** the zip is built, **Then** those are left out, the rest are included, and the UI shows how many were skipped.
3. **Given** two candidates with the same name, **When** the zip is built, **Then** both files are present under distinct names.
4. **Given** the same access rules as User Story 1, **When** a disallowed user calls the endpoint, **Then** they receive 403 and no zip is written.

### User Story 3 - CSV Export Carries Contact and Profile Fields (Priority: P2)

The client "Export CSV" (spec 003 FR-013) includes the candidate's phone, current
role, current company, years of experience, location and LinkedIn, so a client can
contact candidates without opening each one.

**Independent Test**: Export a job's CSV from `/client`; the header row lists the
columns in FR-007 and each record carries the candidate's values.

### Edge Cases

- A candidate name with characters that are unsafe in filenames (`/`, `\`, `:`, quotes, control characters) is reduced to safe characters; an empty result falls back to `candidate`.
- A resume stored without an extension in `resume_filename` keeps the extension from its storage path.
- Concurrent "Download all" clicks on the same job overwrite the same zip; each caller gets a link to a complete zip (upload is a single upsert).
- A very large job may exceed the storage per-file size limit; the API then returns 502 and single downloads still work.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A caller is **allowed** for a job when either:
  - they are an active `team_members` row with role `admin`, `recruiter` or `hiring_manager` in the job's org, or
  - the job id is in `client_post_ids_for_user(caller)` (migration 032, which already excludes staff, revoked grants and unmarked accounts).

  Every endpoint in this spec MUST apply this check on the server before touching storage. Unknown ids return 404; known but disallowed return 403.
- **FR-002**: `GET /api/v1/applications/{application_id}/resume` MUST return
  `{url, filename, expires_in}` for an allowed caller, where `url` is a signed link
  to `applications.resume_url` in the `resumes` bucket, valid for **300 seconds**,
  that downloads as `filename` (the stored `resume_filename`). 404 when the
  application has no `resume_url` or the file does not exist.
- **FR-003**: `POST /api/v1/jobs/{job_id}/resume-export` MUST, for an allowed caller:
  - download every application's resume for the job with the service key,
  - build a zip with Python's standard `zipfile`, one entry per resume named `{candidate name}{ext}` (de-duplicated with ` (2)`, ` (3)`…),
  - upsert it to the `resumes` bucket at `exports/{job_id}/resumes.zip`, overwriting any previous export, so at most one export file exists per job,
  - return `{url, filename, included, skipped, expires_in}` where `url` is a 300-second signed link that downloads as `{job title slug}-resumes.zip`.

  Applications with no resume or a missing file are skipped, not errors. When no
  resume is available the endpoint returns 404 and writes nothing.
- **FR-004**: The zip is returned as a signed storage link, not through the Next.js
  `/api/proxy` route, which only relays JSON and is subject to Netlify's response
  size limit.
- **FR-005**: Each successful download and export MUST be logged (structured JSON)
  with the caller's user id, whether they are staff or client, and the application
  or job id and counts. Failed storage reads are logged as warnings.
- **FR-006**: UI:
  - "Download resume" button on the admin candidate page and on `/client/jobs/[id]/candidates/[applicationId]`.
  - "Download all resumes" button on the admin job page and on `/client/jobs/[id]`, next to "Export CSV".
  - While working, buttons are disabled and show progress; errors show the API's `detail`.
- **FR-007**: The client CSV export (spec 003 FR-013) MUST have these columns in
  order: Name, Email, Phone, Current role, Current company, Years experience,
  Location, LinkedIn, Status, Overall %, Skill match %, Experience match %,
  Culture match %, Top skills, Applied. Formula-injection escaping still applies.
- **FR-008**: No database migration and no `storage.objects` policy change. Existing
  admin, recruiter, candidate and client flows are unchanged apart from the added
  buttons and CSV columns.

### Key Entities

- **Export file**: `resumes/exports/{job_id}/resumes.zip` — one per job, overwritten on each export. Not referenced from any table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An allowed staff member and an allowed client can each download a single resume and a job zip; a client of another job, a revoked client and staff of another org each get 403 (backend tests).
- **SC-002**: A zip for a job with N stored resumes contains N entries with unique names.
- **SC-003**: The client CSV header matches FR-007 exactly.
- **SC-004**: Existing backend test baseline is unchanged apart from new passing tests; `pnpm build` passes.

## Assumptions

- `applications.resume_url` holds the path inside the `resumes` bucket (as written by the `/apply` form) and `resume_filename` the original upload name.
- Resumes are at most 5 MB each (the `/apply` upload limit), so building a job's zip in memory is acceptable for current job sizes.
- The export file sits in the same bucket as the resumes it copies, so it is exactly as protected as they are. The pre-existing `allow_authenticated_read` storage policy (see spec 003 Known Issues / open follow-up) affects both equally; this feature neither fixes nor widens it.

## Out of Scope

- Fixing the `allow_authenticated_read` storage policy.
- Resume preview in the browser, photo download, and download of interview recordings or transcripts.
- Deleting old export files on a schedule (one file per job is overwritten instead).
- A download count or audit table (structured logs only).
