# Feature Specification: Reopen Job

**Feature Branch**: `008-reopen-job`
**Created**: 2026-10-20
**Status**: Draft
**Input**: A closed job only offers "Archive". Reopening means editing the deadline and switching on "Publish now" (spec 006 assumption), which is not discoverable. If the old `closes_at` is still in the past, `auto_close_expired_posts()` (pg_cron, every 15 minutes, spec 006 FR-002) closes the job again.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Reopens a Closed Job (Priority: P1)

An admin or recruiter opens a closed job's page, clicks "Reopen", chooses a new
closing date (or no closing date), and the job is published again.

**Acceptance Scenarios**:
1. **Given** a job with status `closed`, **When** its page loads, **Then** the header shows a "Reopen" button next to "Archive".
2. **Given** a job with status `draft`, `published` or `archived`, **When** its page loads, **Then** no "Reopen" button is shown.
3. **Given** the Reopen dialog, **When** a closing date in the future is entered and confirmed, **Then** the job's status becomes `published`, `closes_at` is that date, and the page shows the job as published.
4. **Given** the Reopen dialog, **When** "No closing date" is ticked and confirmed, **Then** the job's status becomes `published` and `closes_at` is null.
5. **Given** the Reopen dialog, **When** the closing date is empty or not in the future and "No closing date" is not ticked, **Then** the confirm button is disabled and the job is not changed.
6. **Given** the update fails, **When** confirm is clicked, **Then** the dialog stays open and shows the error, and the job is not shown as reopened.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The job detail header (`frontend/app/(admin)/jobs/[id]/job-detail-client.tsx`) MUST show a "Reopen" button only when the job's status is `closed`.
- **FR-002**: "Reopen" MUST open a dialog with a closing-date input (`datetime-local`, local time) and a "No closing date" checkbox. When the job has a future `closes_at`, the input MUST be pre-filled with it; otherwise it starts empty.
- **FR-003**: Confirming MUST update `hiring_posts` in one write: `status = 'published'` and `closes_at` = the chosen date as an ISO timestamp, or null when "No closing date" is ticked. `published_at` is left unchanged. The update MUST match only while the job's status is still `closed`; if no row is updated (archived or changed meanwhile), the dialog stays open and says so.
- **FR-004**: Confirm MUST be disabled unless "No closing date" is ticked or the date is later than the current time, so a reopened job is never immediately re-closed by `auto_close_expired_posts()`.
- **FR-005**: The write MUST go through the browser Supabase client under the existing `hiring_posts` RLS, the same path the "Close" button uses. No migration, backend or API change.

## Success Criteria *(mandatory)*

- **SC-001**: On a local build, reopening a closed test job with a future date publishes it with that date, and with "No closing date" publishes it with `closes_at` null.
- **SC-002**: `pnpm lint`, `tsc --noEmit` and `pnpm build` pass.

## Assumptions

- Archived jobs stay archived; reopening applies to `closed` only.
- Who may reopen is whoever RLS already allows to update `hiring_posts` (admins and recruiters).

## Out of Scope

- A Reopen action in the jobs list.
- Emailing candidates or admins when a job reopens.
- Server-side enforcement of a future `closes_at` on publish.
