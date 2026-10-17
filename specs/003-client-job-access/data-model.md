# Data Model: Client Job Access

Companion to `spec.md`. Describes the access-control objects added by migration
`supabase/migrations/032_job_client_access.sql`, as built. The base tables and the
staff/candidate/anonymous model are in `specs/002-multi-org-isolation/data-model.md`.

Checks: `verify-032.sql` (read-only, safe for production) and `rls-test-032.sql`
(local only, runs inside `BEGIN … ROLLBACK`).

## Access path

This feature adds a fifth path next to the four in spec 002:

| Path | Predicate root | Used by |
|---|---|---|
| **Client** | `job_client_access.email = lower(auth.users.email)` with an active grant, via `client_post_ids_for_user()` | `/client` portal |

A client is not a stored role. A user is a client for a post when **all** hold:

- `auth.users.email_confirmed_at IS NOT NULL`
- `auth.users.raw_app_meta_data->>'int_ai_client' = lower(auth.users.email)` (server-only
  marker bound to the invited address;
  only the service role can write `app_metadata`. Set by the invite's
  `create_user` or by `prepare_client_account()`. The password column is not
  consulted: Supabase Auth stores a hash on every account, passwordless or not.)
- no `team_members` row for the user, in any org, role or status
- an active grant (`revoked_at IS NULL`) on that post for the lower-cased email

## Table: `job_client_access`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `hiring_post_id` | `uuid` NOT NULL | → `hiring_posts(id)` `ON DELETE CASCADE` |
| `email` | `text` NOT NULL | CHECK `email = lower(btrim(email)) AND email <> ''` |
| `client_company` | `text` | optional; backend stores blank as NULL |
| `invited_by` | `uuid` | → `team_members(id)` `ON DELETE SET NULL` |
| `created_at` | `timestamptz` NOT NULL | `now()` |
| `revoked_at` | `timestamptz` | NULL = active |

Indexes:

- `job_client_access_active_uq` — UNIQUE `(hiring_post_id, email) WHERE revoked_at IS NULL`.
  At most one active grant per (job, email). The backend maps its violation
  (23505) to 409.
- `job_client_access_email_idx` — `(email) WHERE revoked_at IS NULL`.

RLS is enabled. Revoking sets `revoked_at`; rows are never deleted by the app. A
re-grant inserts a new row beside the revoked one.

## Functions

All seven are `SECURITY DEFINER` with `SET search_path = public` (the 002
pattern). The six read functions are `LANGUAGE sql STABLE`;
`prepare_client_account` is `LANGUAGE plpgsql VOLATILE` and references `auth.*`
and `extensions.*` (pgcrypto) schema-qualified.

| Function | Returns | EXECUTE |
|---|---|---|
| `client_post_ids_for_user(p_user_id uuid)` | `SETOF uuid` — post ids the user is a client for. **The single source of eligibility.** | `service_role` only (revoked from `PUBLIC`, `anon`, `authenticated`). Used by the backend change-request check. |
| `client_visible_post_ids()` | `SETOF uuid` — the above for `auth.uid()` | default |
| `client_visible_application_ids()` | `SETOF uuid` — applications on those posts | default |
| `client_visible_candidate_ids()` | `SETOF uuid` — candidates of those applications | default |
| `client_visible_session_ids()` | `SETOF uuid` — interview sessions of those applications | default |
| `prepare_client_account(p_email text)` | `text` — on `lower(btrim(p_email))`: `missing` (no auth user), `staff` (has a `team_members` row; unchanged), `ready` (marker already equals this email; unchanged), or `prepared` (marker set to the email in `raw_app_meta_data`, `encrypted_password` replaced by a random bcrypt hash, `phone`/`phone_confirmed_at` cleared, non-`email` `auth.identities` rows and all `auth.mfa_factors` rows deleted, `auth.sessions` rows deleted, `auth.refresh_tokens` cascading). | `service_role` only (revoked from `PUBLIC`, `anon`, `authenticated`). Used by the backend invite endpoint. |
| `client_sessions_for_application(p_application_id uuid)` | `TABLE (id, application_id, status, started_at, ended_at, duration_seconds, questions_asked, terminated_at_question, timer_remaining_at_termination real, created_at)`, newest first; empty unless the application is client-visible | default |

`client_sessions_for_application` is the only way a client sees session
metadata. It leaves out `invite_token` and `reconnection_token`.

Via PostgREST, a `SETOF uuid` RPC returns a plain JSON array of id strings; the
portal and backend normalise both scalar and single-key-object shapes.

## Policy matrix (added or changed by 032)

| Table | Policy | Command | Roles | Predicate |
|---|---|---|---|---|
| `job_client_access` | `jca_admin_all` | ALL | `authenticated` | `EXISTS (hiring_posts hp WHERE hp.id = hiring_post_id AND is_org_admin(hp.org_id))` (USING and WITH CHECK) |
| `hiring_posts` | `hp_client_select` | SELECT | `authenticated` | `id IN (SELECT client_visible_post_ids())` |
| `applications` | `app_client_select` | SELECT | `authenticated` | `id IN (SELECT client_visible_application_ids())` |
| `candidates` | `cand_client_select` | SELECT | `authenticated` | `id IN (SELECT client_visible_candidate_ids())` |
| `resume_data` | `rd_client_select` | SELECT | `authenticated` | `application_id IN (SELECT client_visible_application_ids())` |
| `interview_qa` | `iqa_client_select` | SELECT | `authenticated` | `session_id IN (SELECT client_visible_session_ids())` |
| `interview_reports` | `ir_client_select` | SELECT | `authenticated` | `session_id IN (SELECT client_visible_session_ids())` |
| `interview_reports` | `ir_anon_share_select` *(recreated)* | SELECT | `public` | `auth.uid() IS NULL AND share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > now())` |

Deliberately absent:

- No policy of any kind on `interview_sessions` for clients (bearer tokens live there).
- No client INSERT, UPDATE or DELETE policy anywhere. Recruiters have no access to
  `job_client_access`; only org admins do.
- The `col IN (SELECT fn())` form makes Postgres evaluate each function once per
  query, not once per row. `TO authenticated` keeps anonymous requests (`/apply`,
  `/report/[token]`) from evaluating them.

### `ir_anon_share_select` change

Before 032 (004/022) the predicate had no `auth.uid() IS NULL` guard, so every
signed-in user could read every shared report in every org. 032 drops and
recreates it with the guard, matching what 022 did for `hp_anon_published_select`.
The public `/report/[token]` page uses a sessionless anon client and is unaffected.

## Column visibility

RLS filters rows, not columns. For a client's granted job:

**Shown in the portal**

- `hiring_posts`: title, department, location type/location, description,
  required skills, experience range, status; the three cutoffs (in score details)
- `candidates`: full name, email, phone, LinkedIn URL
- `applications`: status, embedding/skill/experience/culture/overall scores, created date
- `resume_data`: parsed name, summary, skills, experience, education,
  `resume_text`, `raw_markdown`, skill/experience/culture match details
- `interview_qa`: all rows of the visible sessions with per-dimension scores
- `interview_reports`: overall grade, recommendation, summary, strengths, concerns,
  notable responses, recommendation detail, dimension averages
- session metadata from `client_sessions_for_application`

**Hidden — not readable at all**

`interview_sessions` rows (incl. `invite_token`, `reconnection_token`),
`hiring_post_private`, `interview_templates`, `organizations`, `team_members`,
`invite_tokens` (raises 42501, pre-existing), `api_keys`, `ai_usage`,
`job_client_access`, and every row belonging to other jobs, including other jobs'
shared reports.

**Readable through the API but not shown in the UI (accepted for v1)**

| Table | Columns |
|---|---|
| `hiring_posts` | `scoring_weights`, `screening_threshold`, `education_requirements`, `interview_template_id`, `created_by`, `share_slug` |
| `applications` | `recruiter_notes`, `recruiter_override`, `decision`, `screening_error`, `screening_failed_at`, `resume_url`, `resume_filename` |
| `candidates` | `auth_user_id`, `photo_url`, `current_role`, `current_company`, `years_experience`, `location` |
| `resume_data` | `embedding`, `parsed_email`, `parsed_projects` |
| `interview_reports` | `share_token`, `share_expires_at`, `candidate_email_body`, `per_dimension_reasoning` |
| `interview_qa` | `score_rationale` |

Storage files behind `resume_url` / `photo_url` are only as protected as the
production `storage.objects` policies (checked before release; not in any migration).

## Overlap with other paths

- **Staff**: any `team_members` row disables the client path entirely; staff keep
  their 022 access.
- **Candidate**: a client's auth user may be linked to a `candidates` row by the
  008 trigger, and the 020/022 candidate policies then expose that person's own
  applied-to jobs. RLS alone therefore over-reports; every `/client` page filters
  by `client_visible_post_ids()` first.
