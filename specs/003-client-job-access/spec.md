# Feature Specification: Client Job Access

**Feature Branch**: `feat/client-job-access`
**Created**: 2026-10-17
**Status**: Implemented (see [Known Issues](#known-issues-as-built)).
**Input**: Nunnari posts jobs for client companies. A person at a client company needs read-only access to one or more specific job posts, without a new organization being created for them.

> **Why this spec exists**: until now a person could only reach hiring data by being
> staff (`team_members`) or by being a candidate who reads their own records. This
> feature adds a third, narrow way in: a person's email is granted on a specific
> job. It sits on top of the isolation model in `specs/002-multi-org-isolation`
> and must not weaken it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Shares a Job With a Client (Priority: P1)

A Nunnari admin opens a job post and finds a "Client access" card. They enter the
client's email and, optionally, the client company name, then click Invite. The
system reserves a sign-in account for that email (so nobody else can register it)
and marks it as a client account, saves the grant, and emails the client a link to the client sign-in page. The card
lists everyone who has access to that job, with a Revoke button next to each
(Revoke asks "Revoke access for {email}?" first). The card renders nothing until
its first list request succeeds, and nothing at all if that request fails, so a
recruiter never sees it, not even briefly.

**Independent Test**: As an org admin, invite `client@example.com` on job J. The
grant shows on the card and the email arrives (or the UI warns that sending failed).
A recruiter in the same org does not see the card.

**Acceptance Scenarios**:
1. **Given** an active org admin on job J, **When** they invite a valid email,
   **Then** an auth account exists for that email, one active grant exists for (J, email), and the response reports whether the email was sent.
2. **Given** an auth account already exists for the email, **When** the admin invites it,
   **Then** the grant is created normally (201). If that account is not staff and
   not yet a client account, it is prepared first: marked as a client, its password
   replaced with an unknowable one, any phone number, non-email sign-in identity and
   MFA factor removed, and all its sessions ended.
3. **Given** an active grant for (J, email), **When** the admin invites the same email again (including two invites racing),
   **Then** the request is rejected with 409 and no duplicate row is created.
4. **Given** reserving the auth account fails for a reason other than "already exists",
   or preparing it fails, **When** the admin invites, **Then** the API returns 502 and
   no grant is saved.
5. **Given** a recruiter, or an admin of a different org, **When** they call the invite, list or revoke endpoints for J,
   **Then** they receive 403.

### User Story 2 - Client Reviews Candidates for Their Job (Priority: P1)

The client opens the link and signs in with their email and a 6-digit code (no
password). They land on `/client`, which lists only the jobs shared with them.
Opening a job shows its description and a table of candidates with screening
scores and status. Opening a candidate shows the resume analysis and, if the
candidate has interviewed, the interview report. Nothing on these pages can
change any data.

**Independent Test**: Grant job J to a client. Sign in as the client. They see J
and its candidates. A direct PostgREST query for any other job's posts,
applications, candidates, resume data, Q&A or reports returns no rows. No UPDATE
or DELETE succeeds on any table.

**Acceptance Scenarios**:
1. **Given** a client granted on J only, **When** they open `/client`, **Then** only J is listed — even if the same person is also a candidate on another job.
2. **Given** the same client, **When** they open `/client/jobs/K` for an ungranted job K, **Then** they get a not-found page — even if they applied to K as a candidate.
3. **Given** the same client, **When** they open a candidate of J, **Then** the parsed resume, screening scores and interview report (if any) are shown, with no override, rescore, notes, email, bulk-action or AI-summary elements.
4. **Given** the same client, **When** they try to update `applications` through the Supabase API, **Then** zero rows change.

### User Story 3 - Revocation Takes Effect Immediately (Priority: P1)

An admin clicks Revoke on a grant. From the client's next request onward, the job
and all of its data are invisible to them, even inside a session that is still
signed in.

**Independent Test**: Revoke the grant while the client is signed in, then reload
`/client/jobs/J`. The page is not found and `/client` no longer lists J.

**Acceptance Scenarios**:
1. **Given** a revoked grant, **When** the client queries any table for J's data, **Then** no rows are returned.
2. **Given** a revoked grant, **When** the admin invites the same email again, **Then** a new active grant is created and access returns.

### User Story 4 - Client Exports the Candidate List (Priority: P2)

On the job page, the client clicks "Export CSV" and downloads all candidates for
the job, one row per application.

**Independent Test**: For a job with N applications, the downloaded file parses to
one header record plus N data records, and Excel and Google Sheets open it correctly.

**Acceptance Scenarios**:
1. **Given** a job with N applications, **When** Export CSV is clicked, **Then** the file contains N data records regardless of any on-screen search or filter.
2. **Given** a name containing a comma, quote or newline, or a value starting with `=`, `+`, `-` or `@`, **When** it is exported,
   **Then** the field is quoted correctly and cannot run as a spreadsheet formula.

### User Story 5 - Client Requests a Change (Priority: P3)

The client wants the job description changed. On the job page they click
"Request a change", type a message and send it. The job's creator and the org's
active admins get an email with the message, and replying goes to the client.

**Independent Test**: Submit a message as the client. The recipients get one email
whose reply-to is the client's address. Nothing in the job changes.

**Acceptance Scenarios**:
1. **Given** an active grant, **When** the client submits a message of 1–2000 characters (after trimming surrounding whitespace), **Then** the API returns 200 and the email is sent.
2. **Given** no active grant (or a caller who fails any client-eligibility check), **When** the endpoint is called, **Then** it returns 403 and no email is sent.
3. **Given** an empty, whitespace-only or over-2000-character message, **When** the client submits it, **Then** the API returns 422 and no email is sent.

### Edge Cases

- **Staff who are also granted**: a user with any `team_members` row, in any role,
  status or org, is never treated as a client. The client access functions return
  nothing for them. `/client` sends them to `/dashboard`, and the staff experience
  is unchanged. A grant made to a staff email therefore does nothing: the invite
  endpoint still saves it (and logs a warning), and `prepare_client_account()`
  leaves the staff account untouched.
- **Candidate who is also a client**: these are separate paths. When the
  client's auth user is created, the existing `link_candidate_auth_user` trigger
  (migration 008) may link it to a `candidates` row with the same email, and the
  existing candidate policies (020, 022) then let that person read their own
  applied-to jobs. The client portal therefore never relies on RLS alone for job
  lists: every `/client` page first calls `client_visible_post_ids()` and shows or
  allows only those jobs. Signing in through `?type=client` always lands on `/client`.
  **Sign-out (accepted):** a candidate's account has no client marker, so inviting
  that candidate's own email as a client runs the `prepared` branch of
  `prepare_client_account()` and deletes their sessions. A candidate signed in to
  `/portal` or an interview through that session is signed out at once (GoTrue
  rejects the access token with `session_not_found`) and must sign in again with an
  email code. Interviews opened from an invite link are not affected. The function
  cannot tell a real candidate from someone who pre-registered the address, so
  it ends the sessions in both cases rather than leave a possible attacker signed in.
- **Account takeover of a client's address**: production auto-confirms new
  sign-ups (`mailer_autoconfirm = true`), so "email confirmed" alone does not prove
  inbox ownership. Two controls apply:
  1. The invite endpoint creates the auth user for the email (confirmed, no
     password, `app_metadata.int_ai_client = true`) before saving the grant, so the
     address cannot afterwards be registered or switched to by someone else.
  2. Client access requires the server-only marker
     `auth.users.raw_app_meta_data.int_ai_client = true`. Only the service role can
     write `app_metadata`; a user cannot set it through sign-up or profile updates.
     If someone registered the address before the invite, their account has no
     marker, so the invite prepares it with `prepare_client_account()`: it sets the
     marker, replaces the password with a random unknowable bcrypt hash, clears any
     phone number, deletes every sign-in identity other than email and every MFA
     factor, and deletes all of the account's sessions (their refresh tokens are
     deleted with them). From then on only the mailbox owner can sign in (email
     one-time code).
  **Residual (accepted):** an access token already issued to the pre-registered
  account is a signed JWT. GoTrue and the backend (`auth.get_user`) reject it at
  once with `session_not_found`, but PostgREST does not check `auth.sessions`, so
  direct database reads with it keep working until it expires (at most 1 hour,
  `jwt_expiry`). It cannot be refreshed.
  The same auto-confirm weakness affects existing candidate linking (008) and is out of scope here.
- **Client sets a password**: the marker is not tied to the password, so access
  continues. Setting a password needs a signed-in session, which only the mailbox
  owner can obtain after the invite.
- **Email case and whitespace**: emails are stored as `lower(btrim(email))`, which
  a CHECK constraint enforces. Matching is always done on lower-cased values.
- **Unconfirmed email**: access also requires `auth.users.email_confirmed_at IS NOT NULL`.
- **Interview session credentials**: `interview_sessions.invite_token` and
  `reconnection_token` act as bearer credentials. Clients get **no** policy on
  `interview_sessions`. They see session metadata only through an RPC that leaves
  those columns out.
- **Shared report links**: the pre-existing `ir_anon_share_select` policy had no
  `auth.uid() IS NULL` guard, so any signed-in user could read every shared report
  in every org. This feature adds the guard (the same fix 022 applied to
  `hp_anon_published_select`). The public `/report/[token]` page uses a sessionless
  anon client and is unaffected.
- **Pre-existing public insert policies**: 023's `cand_anon_insert` and
  `app_anon_insert` are `TO public`, so a signed-in client is treated like any anonymous
  visitor: a direct `candidates` insert succeeds. A direct `applications` insert
  currently fails for everyone with Postgres error 42P17 (infinite recursion: 023's
  insert check reads `hiring_posts`, whose 020 `hp_candidate_select` reads
  `applications`). This is pre-existing and unrelated to 032; the real `/apply`
  form submits through the backend and is unaffected. Neither policy is changed here.
- **Pre-existing unauthenticated endpoints (accepted v1 risk)**: clients now hold
  `session_id`, `candidate_id` and `hiring_post_id` values for their job.
  - `POST /api/v1/interview/terminate-abandoned` accepts a bare `session_id` and can end an in-progress interview.
  - `POST /api/v1/webhooks/application-status-changed` accepts a payload and sends status emails to the named candidate.
  Both were already callable by anyone with the ids. Hardening them touches the live interview flow and a dashboard-configured webhook, and is a tracked follow-up (see Out of Scope).
- **Job deleted**: grants cascade-delete with the job.
- **Job closed or archived**: a grant still applies whatever the job status is,
  until it is revoked.
- **Expired sign-in and sign-out**: on `/client/*`, expiry sends the person to
  `/auth/login?type=client`, not to the staff password form. The portal's Sign Out
  button goes to the same page (`LogoutButton` takes an optional `redirectTo`,
  default `/`, so every other usage is unchanged).
- **Invite email fails**: the grant is still saved. The response returns
  `email_sent: false` and the card shows a warning, the same behaviour as team invites.
- **Policy cost**: the new SELECT policies are `TO authenticated`, so anonymous
  requests (`/apply`, shared reports) never evaluate them. Staff requests do. The
  policies MUST use the `col IN (SELECT set_returning_fn())` form, which Postgres
  evaluates once per query, not once per row.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Table `job_client_access` MUST record one row per (job, email) grant,
  with:
  - company name (optional)
  - the inviting team member (`ON DELETE SET NULL`)
  - created time
  - revoked time

  At most one active (`revoked_at IS NULL`) row may exist per (job, email).
- **FR-002**: Only active org **admins** of the job's organization may create, list
  or revoke grants. Recruiters may not. The backend endpoints and the RLS policy on
  `job_client_access` MUST both enforce this.
- **FR-003**: Client eligibility MUST be decided in one place,
  `client_post_ids_for_user(p_user_id)`. It is `SECURITY DEFINER`, uses
  `SET search_path = public`, and EXECUTE is granted to `service_role` only. A post
  is returned when the user:
  - has an email-confirmed auth account;
  - carries the server-only marker `raw_app_meta_data->>'int_ai_client' = 'true'`;
  - has **no `team_members` row**;
  - has a lower-cased email with an active grant on the post.

  The password column is not consulted: Supabase Auth stores a bcrypt hash on
  every account it creates, including passwordless ones.

  The RLS-facing functions are all `SECURITY DEFINER` with
  `SET search_path = public` (the 002 pattern):
  - `client_visible_post_ids()` (calls the above with `auth.uid()`)
  - `client_visible_application_ids()`
  - `client_visible_candidate_ids()`
  - `client_visible_session_ids()`
- **FR-004**: Migration 032 MUST add SELECT-only, `TO authenticated` client policies
  on `hiring_posts`, `applications`, `candidates`, `resume_data`, `interview_qa` and
  `interview_reports`, limited to the granted jobs. 032 adds no INSERT, UPDATE or
  DELETE policy usable by clients. The pre-existing 023 public insert policies on
  `candidates` and `applications` still apply to clients exactly as to anonymous
  visitors and are out of scope.
- **FR-005**: Clients MUST NOT be able to read `interview_sessions`,
  `hiring_post_private`, `interview_templates`, `organizations`, `team_members`,
  `invite_tokens`, `api_keys`, `ai_usage` or `job_client_access`.
  - Session metadata the report needs comes only from
    `client_sessions_for_application(p_application_id)`, which returns whitelisted columns.
  - Migration 032 MUST also recreate `ir_anon_share_select` with an
    `auth.uid() IS NULL` guard, so signed-in users (clients included) cannot read
    other jobs' shared reports.
- **FR-006**: Revoking MUST set `revoked_at`. All client functions read `revoked_at`,
  so access ends on the client's next request.
- **FR-007**: Before saving a grant, the invite endpoint MUST prepare a client
  auth account for the email:
  - It calls `auth.admin.create_user({email, email_confirm: true, app_metadata:
    {int_ai_client: true}})` with no password. An "already registered"
    (`email_exists`) error counts as success.
  - It then calls `prepare_client_account(email)` (migration 032;
    `SECURITY DEFINER`, `SET search_path = public`, EXECUTE for `service_role`
    only). On `lower(btrim(email))` it returns:
    - `missing`: no auth user; nothing changed;
    - `staff`: the user has a `team_members` row; nothing changed;
    - `ready`: the user already carries the marker; nothing changed;
    - `prepared`: a pre-existing non-staff account without the marker. The marker
      is merged into `raw_app_meta_data`, `encrypted_password` is replaced with a
      fresh random bcrypt hash, `phone` and `phone_confirmed_at` are cleared, the
      user's `auth.identities` rows other than `provider = 'email'` and all
      `auth.mfa_factors` rows are deleted, and the user's `auth.sessions` rows are
      deleted (`auth.refresh_tokens` cascade from them).
  - `ready` and `prepared` proceed. `staff` also proceeds and the grant is saved
    (it is inert by design), with a warning logged.
  - `missing` after `create_user`, any other result, or any other failure returns
    502 and saves no grant.

  The invite email MUST link to `${FRONTEND_URL}/auth/login?type=client`. There the
  client signs in with the Supabase email one-time code (passwordless; the same
  mechanism candidates use). No password is ever issued to a client.
- **FR-008**: The login page MUST support `?type=client`. It uses the email-code
  flow, shows the title "Client Access", and sends the person to `/client` after
  verification.
- **FR-009**: Middleware MUST redirect signed-out requests for `/client` and
  `/client/*` to `/auth/login?type=client`. The client layout MUST mount
  `AuthErrorHandler`, and on `/client*` it MUST send expired sessions to the same page.
- **FR-010**: The client portal MUST live under the literal path `/client` with its
  own plain layout: a header with the product name, the user's email, theme toggle
  and sign-out. It MUST NOT render the admin sidebar, use `OrgProvider`, or call
  `link-candidate`. A signed-in user with a `team_members` row MUST be redirected
  to `/dashboard`.
- **FR-011**: The portal MUST provide the pages below. Every page MUST first obtain
  `client_visible_post_ids()` and restrict itself to those ids; it MUST NOT rely on
  RLS alone, because of candidate overlap.
  - `/client`: the list of granted jobs, or an empty state.
  - `/client/jobs/[id]`: job summary, description, required skills and a
    read-only candidate table. Not found unless `id` is granted.
  - `/client/jobs/[id]/candidates/[applicationId]`: resume analysis and interview
    report. Not found unless the application belongs to `id` and `id` is granted.
- **FR-012**: Admin components reused in the portal MUST receive a `readOnly`
  prop, defaulting to `false`, so that admin behaviour is unchanged. When
  `readOnly` is true:
  - **Candidate table:** no selection column, no score-details/rescore column, no
    bulk actions, no compare button, and row links go to the client route.
  - **Interview report:** no override card, no AI-summary fetch, and no AI Interview Summary card.
  - **Score details:** no rescore control.
- **FR-013**: The job page MUST offer a CSV export of all candidates for the job,
  generated in the browser. Fields that start with `= + - @`, a tab or a carriage
  return MUST be prefixed with `'` to block formula injection.
- **FR-014**: `POST /api/v1/client/jobs/{job_id}/change-request` MUST:
  - confirm eligibility by checking that `job_id` is in
    `client_post_ids_for_user(caller_id)`; otherwise return 403;
  - email the message, HTML-escaped, to the job creator and the active admins of
    the job's org, with `reply_to` set to the client's email (the creator is looked
    up only when `created_by` is not null; it can be null after `ON DELETE SET NULL`);
  - change no data.

  The message is trimmed of surrounding whitespace and must then be 1–2000
  characters, otherwise 422 (the UI also disables Send for a blank message).
  If looking up one recipient's email fails, that recipient is logged and skipped;
  the endpoint returns 502 only when no recipient remains.

  No rate limit in v1 (see Out of Scope).
- **FR-015**: Grant-management endpoints MUST be:
  - `GET /api/v1/jobs/{job_id}/client-access`
  - `POST /api/v1/jobs/{job_id}/client-access`
  - `DELETE /api/v1/jobs/{job_id}/client-access/{grant_id}`

  The DELETE returns 200 `{"status":"ok"}`, because the frontend proxy re-encodes
  every response as JSON. A unique-index violation on insert MUST map to 409, not 500.
- **FR-016**: Migration `032_job_client_access.sql` MUST create every object
  above. The 002 drift check (`verify-022.sql`) MUST be updated so that the new
  policies are not flagged as undeclared, and `verify-032.sql` MUST assert the
  new objects and the `ir_anon_share_select` guard.
- **FR-017**: Existing admin, recruiter, candidate portal, anonymous `/apply`,
  interview and shared-report flows MUST behave exactly as before.

### Data Visible to Clients (decision)

- **Visible in the portal**:
  - Job public fields: title, department, location, description, required skills, experience range, status. The three cutoffs are shown in the candidate score details.
  - Candidate name, email, phone and LinkedIn (a clickable link only when it starts with `http(s)://`).
  - Application status and the four screening scores.
  - Parsed resume fields, `resume_text` / `raw_markdown`, and match details.
  - Interview Q&A with per-dimension scores, and the interview report.
- **Hidden, not readable at all**:
  - Culture expectation (`hiring_post_private`)
  - Interview template configuration
  - Interview session rows and tokens
  - AI cost and usage (`ai_usage`)
  - Team, org, invite and API-key data
  - Grant records (`job_client_access`)
  - Other jobs' data, including other jobs' shared reports
- **Readable at the data layer but not shown in the portal UI** (RLS filters rows,
  not columns, so a technically capable client could read these through the API;
  accepted for v1):
  - `hiring_posts`: `scoring_weights`, `screening_threshold`, `education_requirements`, `interview_template_id`, `created_by`, `share_slug`
  - `applications`: `recruiter_notes`, `recruiter_override`, `decision`, `screening_error`, `screening_failed_at`, `resume_url`, `resume_filename`
  - `candidates`: `auth_user_id`, `photo_url`, and `current_role`, `current_company`, `years_experience`, `location` (the candidate page fetches these four but does not display them)
  - `resume_data`: `embedding`, `parsed_email`, `parsed_projects`
  - `interview_reports`: `share_token`, `share_expires_at`, `candidate_email_body`, `per_dimension_reasoning`
  - `interview_qa`: `score_rationale`

  The admin "Client access" card says so in one line: "Clients can see this job's
  candidates, screening scores, interview reports, recruiter notes and scoring settings."
  Storage files behind `resume_url` / `photo_url` are only as protected as the
  production `storage.objects` policies, which are checked before release.

### Key Entities

- **job_client_access**: `(id, hiring_post_id → hiring_posts ON DELETE CASCADE,
  email, client_company, invited_by → team_members ON DELETE SET NULL, created_at,
  revoked_at)`. This is the sole authority for client access.
- **Client** (not a stored role): an authenticated user who:
  - has an email-confirmed account carrying the `int_ai_client` app_metadata marker;
  - has no `team_members` row;
  - has at least one active grant.
- Existing entities are unchanged, except for the `ir_anon_share_select` guard:
  hiring_posts, applications, candidates, resume_data, interview_sessions,
  interview_qa, interview_reports (see spec 002).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With two jobs J and K seeded (K's report carrying a live
  `share_token`) and a client granted on J, the client receives zero rows for K, or
  for anything outside J, from `hiring_posts`, `applications`, `candidates`,
  `resume_data`, `interview_qa` and `interview_reports`, and zero rows from every
  table listed in FR-005 (for `invite_tokens` the read raises 42501 instead of
  returning 0 rows, because 022's `it_self_select` reads `auth.users`; this is
  pre-existing and still yields nothing). This is verified by `rls-test-032.sql`.
- **SC-002**: The client's UPDATE and DELETE attempts change 0 rows on every table.
  Their INSERT is refused on every table except the pre-existing 023 public-insert
  path, which behaves exactly as for anonymous visitors (`candidates` succeeds;
  `applications` currently fails with 42P17, see Edge Cases). A client cannot
  insert a grant for themselves.
- **SC-003**: After revocation, the client gets 0 rows for J on the next query.
- **SC-004**: The admin, recruiter, candidate and anonymous (`/apply` read,
  candidate insert, and shared-report read) checks in `rls-test-032.sql` give the
  expected row counts with migration 032 applied.
- **SC-005**: A CSV for a job with N applications parses to N+1 records and opens
  correctly in Excel and Google Sheets.
- **SC-006**: `uvx ruff check app/` passes, the backend test suite shows no new
  failures against a baseline recorded before work starts, and
  `pnpm lint && pnpm build` shows 0 errors.

## Known Issues (as built)

Found while implementing on 2026-10-17.

- **KI-1 (resolved 2026-10-17): the "no password" rule rejected every real client.**
  Supabase Auth stores a password hash on every account it creates, so
  `coalesce(encrypted_password,'') = ''` never held for a real account. Eligibility
  now uses the server-only `int_ai_client` app_metadata marker, and pre-registered
  accounts are prepared by `prepare_client_account()` (FR-003, FR-007).
- **KI-2 (resolved 2026-10-17): change-request failed on one bad recipient lookup.**
  A failed lookup now skips that recipient; 502 only when none remains (FR-014).
- **KI-3: local Postgres crash in tests.** In the local `supabase/postgres
  17.6.1.104` image, a session that does `SET ROLE anon|authenticated` and then hits
  "permission denied for function" crashes the database process (signal 11),
  reproduced with a trivial function, so not caused by 032 (likely
  `supautils.hint_roles`). `rls-test-032.sql` therefore checks
  `has_function_privilege(...) = false` instead of calling the function. Through the
  REST API the same call returns a clean 42501. `supabase/.temp/postgres-version`
  records the same image for production, so a role-switching SQL session there (for
  example Studio's "impersonate role") might crash it too. Unverified.
- **KI-4: verification not yet done.** The in-browser acceptance checks (admin
  invite/revoke, recruiter sees no card, client OTP sign-in, staff redirect from
  `/client`, admin spot-checks of the shared components, opening the CSV in Excel
  and Google Sheets) have not been run. Done so far: `ruff`, the
  backend suite (only baseline failures), `pnpm lint` (0 errors), `pnpm build`
  (succeeds; 23/23 pages, `/client` routes present), `tsc --noEmit`,
  a CSV round-trip script, `rls-test-032.sql`, `verify-032.sql`, `verify-022.sql`,
  the portal's queries run through the local REST API, and the invite account
  flow against local GoTrue (new account gets the marker and `prepare_client_account`
  returns `ready`; a self-registered account cannot set the marker, is `prepared`,
  and its old password is then rejected).

## Assumptions

- Supabase email OTP is enabled in production, and its email template includes the
  6-digit code; candidates already rely on this. This is re-checked at release.
- The user's "magic link" decision is met by this passwordless email sign-in. A
  one-click link is not used, because server-generated magic links are single-use
  and expire within the hour, while invite emails are often opened later.
- The backend pre-creates the client's auth user with `create_user` on invite. It
  never calls `list_users()`, which avoids the 50-user page limit in `team.py`. The
  client login keeps `shouldCreateUser: true`, the same as candidates; an auth
  account by itself grants nothing.
- Production auto-confirms sign-ups (`mailer_autoconfirm = true`, observed
  2026-10-17). The server-only marker, account preparation and pre-creation make
  client access safe regardless of this setting (see the residual in Edge Cases).
- Production sign-in is email only (password and email one-time code): no SMS
  provider, no OAuth provider or manual identity linking, no anonymous sign-in.
  `prepare_client_account()` also strips phone, non-email identities and MFA
  factors in case this changes, but a new sign-in method enabled later should be
  reviewed against this feature. This is re-checked at release.
- `prepare_client_account()` runs as its owner (`postgres` after `db push`), which
  must be able to update `auth.users` and delete from `auth.sessions`,
  `auth.identities` and `auth.mfa_factors`. Postgres checks this only when the
  function runs, so `verify-032.sql` checks it; run that before the first real invite.
- Clients are not expected to also be staff in any org. If one is, the staff role wins.
- The `hiring_manager` role is admitted by `AdminLayout` and by
  `_resolve_admin_*` in the backend, but every 002 `SECURITY DEFINER` helper
  leaves it out. This feature does not change that, and does not reuse
  `hiring_manager` for clients. Fixing it belongs in spec 002.

## Out of Scope (v1)

- Clients editing jobs, moving candidates between stages, adding notes, or
  overriding decisions.
- Resume file download. No `storage.objects` policy exists in any migration,
  the production storage policies have drifted and are unverified, and no
  staff download exists to mirror. The parsed resume and the extracted resume
  text are shown instead.
- The AI interview summary in the client view. The existing summary fetch is
  broken (the call sends no token and gets a 422), and each view would make a
  paid LLM call.
- Filtered CSV export (v1 exports all candidates for the job).
- A rate limit on "Request a change". This is an accepted risk: senders are named,
  invited contacts, and every message carries their reply-to address.
- Hardening `POST /api/v1/interview/terminate-abandoned` and
  `POST /api/v1/webhooks/application-status-changed`, both of which act on ids
  with no authentication. Follow-up:
  - The beacon should carry a per-session secret, which requires returning it from `create-room`.
  - The webhook should check a shared-secret header, which requires updating the dashboard webhook and the `pg_net` triggers.
- Tightening the 023 public insert policies. `/apply` submits through the backend
  (`application-form.tsx`), which contradicts 023's header; this needs its own check.
- The candidate comparison view, realtime table updates, audio playback,
  client-to-client sharing, grant expiry dates, and notifications to clients.
- A client "organization" or account type, and any pages a client can manage.
- Fixing pre-existing defects found during exploration:
  - `_resolve_admin_*` returns 500 when the user has no team row, or errors on multiple team rows.
  - `/report/[token]` reads the wrong tables.
  - `user_profiles` is referenced but no migration creates it.
  - Invited staff are never promoted to `active`.
  - Candidate linking (008) trusts auto-confirmed emails.
  - The anonymous `applications` insert recursion (42P17) and the `invite_tokens`
    42501 for signed-in non-admins (see SC-001, SC-002).
