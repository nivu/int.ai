# Feature Specification: Job Closing

**Feature Branch**: `006-job-closing`
**Created**: 2026-10-18
**Status**: Implemented
**Input**: Jobs have a closing date (`hiring_posts.closes_at`) that nothing enforces. `auto_close_expired_posts()` (migration 005) was never scheduled, so 9 published jobs past their date kept taking applications (8 arrived after closing, including 2 on the Fluxbooks "Senior AI/ML Engineer" job). Candidates opening a closed job's link should be told the job is closed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Candidate Opens a Closed Job's Link (Priority: P1)

A candidate opens `/apply/{slug}` for a job that is closed, either because its
status is `closed`/`archived` or because `closes_at` has passed. Instead of the
form they see "This job has been closed" with the job's title.

**Acceptance Scenarios**:
1. **Given** a published job with `closes_at` in the past, **When** the link is opened, **Then** the page shows "This job has been closed" and "{title} is no longer accepting applications.", and no form.
2. **Given** a job with status `closed` or `archived`, **When** the link is opened, **Then** the same closed message is shown with its title.
3. **Given** a published job with `closes_at` null or in the future, **When** the link is opened, **Then** the form is shown as before.
4. **Given** an unknown slug or a `draft` job, **When** the link is opened, **Then** "Job not found" is shown and no title is revealed.

### User Story 2 - Late Submissions Are Refused (Priority: P1)

A form left open past the closing date, or a direct API call, cannot create an
application after the job closes.

**Acceptance Scenarios**:
1. **Given** a published job with `closes_at` in the past, **When** `POST /api/v1/applications/submit` is called, **Then** it returns 403 "This position is no longer accepting applications." and no application is created.

### User Story 3 - Status Follows the Closing Date (Priority: P2)

Within 15 minutes of `closes_at`, a published job's status becomes `closed`, so
the admin dashboard shows it as closed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Migration `034_job_closing.sql` MUST add
  `public_job_status(p_slug text) RETURNS TABLE(title text, is_open boolean)`,
  `SECURITY DEFINER`, `search_path = public`, executable by `anon` and
  `authenticated`. It returns a row only for jobs with status `published`,
  `closed` or `archived`, and only the title and
  `is_open = status = 'published' AND (closes_at IS NULL OR closes_at >= now())`.
  Drafts and unknown slugs return no row. Anonymous visitors still cannot read
  closed jobs' other columns.
- **FR-002**: The migration MUST enable `pg_cron` and schedule
  `auto_close_expired_posts()` every 15 minutes as job `auto-close-expired-posts`,
  replacing any job of that name.
- **FR-003**: The apply page MUST call `public_job_status` first and render the
  closed message when `is_open` is false, "Job not found" when no row returns,
  and the existing form otherwise.
- **FR-004**: The submit endpoint MUST refuse (403) when the job is not published
  or its `closes_at` is in the past, before any application is written.
- **FR-005**: Turning this on closes every published job already past its date
  (9 at 2026-10-18: 6 Acme Corp, 3 Tristha). Agreed by the platform owner; an
  org admin reopens a job by moving its closing date and publishing it again.

## Success Criteria *(mandatory)*

- **SC-001**: `/apply/pjswbysm` (Senior AI/ML Engineer) shows the closed message with its title after deploy.
- **SC-002**: Within 15 minutes of deploy, no job has `status = 'published' AND closes_at < now()`.
- **SC-003**: Backend tests cover a past-date submission returning 403.

## Assumptions

- `closes_at` is stored as a timestamp with time zone; "past" means `< now()`.
- An org admin who wants to reopen a job edits its closing date and publishes it; no new UI is needed.

## Out of Scope

- Emailing candidates or org admins when a job closes.
- Changes to the admin job editor.
