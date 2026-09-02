# Feature Specification: Multi-Organization Isolation & Role-Based Access

**Feature Branch**: `002-multi-org-isolation`
**Created**: 2026-09-02
**Status**: As-Built (retroactively specified)
**Input**: Reverse-engineered from shipped work — see `research.md` (2026-07-04 session), migrations 007/019/020, and the RLS policy set currently live in production.

> **Why this spec exists**: the organization/role model was implemented and deployed
> without a specification. `specs/001-hiring-automation-platform` describes the hiring
> pipeline as if a single organization owns all data — it never mentions `org_id`,
> tenancy, or the recruiter role. This document specifies the isolation model
> **as it actually behaves in production**, so it can be reviewed, tested, and
> maintained rather than rediscovered during the next incident.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Org Data Never Leaks Across Tenants (Priority: P1)

An admin at Organization A signs in to the dashboard. They see only their own
organization's hiring posts, candidates, applications, interview sessions and
reports. Data belonging to Organization B is invisible to them through every
surface — dashboard, candidate list, analytics, direct API call, and direct
PostgREST query — regardless of whether they guess a valid record ID.

**Acceptance**: With two organizations seeded, an authenticated Org A admin
issuing a request for an Org B record receives an empty result or 403, never
Org B's data.

### User Story 2 - Recruiters Have Reduced Privileges Within Their Org (Priority: P1)

A recruiter belongs to one organization. They can read that organization's
hiring posts, candidates, applications and interview results, and can create
job posts, but they cannot modify organization settings, manage team members,
or issue invitations.

**Acceptance**: A recruiter's write attempt against `organizations`,
`team_members`, or `invite_tokens` is rejected; their read of org-scoped
hiring data succeeds.

### User Story 3 - Public Application Page Stays Open Without Leaking (Priority: P1)

An anonymous visitor opens a shared job link (`/apply/<share_slug>`) and can
read that published post in order to apply. The same anonymous-access path must
not become a channel through which an *authenticated* user of another
organization can enumerate all published posts.

**Acceptance**: An unauthenticated request for a published post with a
`share_slug` succeeds. An authenticated Org A user does not receive Org B's
published posts from the same table.

### User Story 4 - Candidates See Only Their Own Records (Priority: P2)

A candidate signs in to the portal and sees their own applications and interview
sessions, matched via `candidates.auth_user_id`, and no one else's.

**Acceptance**: A signed-in candidate reads exactly their own application rows;
another candidate's rows are not returned.

### Edge Cases

- **RLS policy recursion**: a policy on `team_members` that itself queries
  `team_members` recurses; PostgreSQL surfaces this as a null/empty result rather
  than an error, so it manifests as "login silently broken" and "all candidates
  disappeared", not as a visible failure. Policies MUST NOT self-reference.
- **Chicken-and-egg on membership lookup**: resolving a user's organization
  requires reading `team_members`, which is itself protected. A non-recursive
  `user_id = auth.uid()` self-select policy MUST exist to break the cycle.
- **Anonymous-access predicate too broad**: `status = 'published'` alone matches
  for authenticated users too. The predicate MUST also assert `auth.uid() IS NULL`.
- **Duplicate interview sessions**: when both a database trigger and the screening
  Celery task create `interview_sessions`, an application gets two rows and the
  earlier invite link breaks. Exactly one creator MUST own that write.
- **Double evaluation**: enqueueing `evaluate_interview_task` from both
  `controller.finish()` and `end_session()` doubles LLM spend and errors on the
  second run. Exactly one call site MUST enqueue it.
- **Silent insert failure**: an evaluator insert naming columns absent from
  `interview_reports` fails without surfacing, leaving sessions marked
  `completed` with no report attached.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every org-owned table MUST have RLS enabled and MUST scope access
  by the requesting user's active membership in the owning organization.
- **FR-002**: Membership checks MUST be performed by `SECURITY DEFINER` functions
  (`is_org_admin`, `is_org_member`, `can_staff_see_application`,
  `can_staff_see_candidate`, `can_staff_see_session`) so that policy evaluation
  does not re-enter RLS and recurse.
- **FR-003**: `SECURITY DEFINER` functions MUST pin `SET search_path = public`
  to prevent search-path hijacking.
- **FR-004**: Only members with `role = 'admin'` and `status = 'active'` may write
  `organizations`, `team_members`, `interview_templates`, `hiring_posts`, or
  `invite_tokens`.
- **FR-005**: Members with `role IN ('admin','recruiter')` and `status = 'active'`
  may read org-scoped hiring data.
- **FR-006**: Anonymous read of `hiring_posts` MUST be restricted to
  `status = 'published' AND share_slug IS NOT NULL AND auth.uid() IS NULL`.
- **FR-007**: Candidates MUST access their own `applications` and
  `interview_sessions` via `candidates.auth_user_id = auth.uid()`.
- **FR-008**: A shared interview report MUST be readable by token holders only
  while `share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > now())`.
- **FR-009**: Backend endpoints that accept a session, application, or candidate
  identifier MUST require an `Authorization` header and verify org ownership
  server-side — RLS alone does not protect service-role calls. This applies to
  `interview` (`/{session_id}/summary`, `/create-room`, `/evaluate`),
  `screening` (`/status/{task_id}`), `email` (`/send`, `/bulk-custom`), and
  `invitations` (`/send`).
- **FR-010**: `POST /email/application-confirmation` MUST remain unauthenticated,
  as it is invoked immediately after a public candidate submission.
- **FR-011**: `interview_sessions` MUST have exactly one creator. The screening
  task owns this; the database trigger MUST NOT also create sessions.
- **FR-012**: `evaluate_interview_task` MUST be enqueued from exactly one call
  site (`controller.finish()`).
- **FR-013**: Q&A scoring MUST be idempotent — rows already carrying scores are
  skipped, so a retry cannot double-score or double-charge.

### Key Entities

- **organizations** — tenant root; every org-owned row traces back to one `org_id`.
- **team_members** — `(org_id, user_id, role, status)`; the authority for all
  staff access decisions. `role ∈ {admin, recruiter}`, `status ∈ {active, …}`.
- **hiring_posts** — org-owned; carries `share_slug` for anonymous apply access.
- **applications / candidates / resume_data** — reached from an org via
  `applications → hiring_posts → org_id`; candidates additionally self-access
  through `auth_user_id`.
- **interview_sessions / interview_qa / interview_reports** — reached via
  `application_id`; reports additionally support token-based external sharing.
- **invite_tokens** — org-owned; recipient self-reads by matching email.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With two seeded organizations, zero cross-org rows are returned
  across all org-owned tables for every role.
- **SC-002**: Admin sign-in succeeds and the candidate list is populated — the
  regression signature of policy recursion is absent.
- **SC-003**: An anonymous request for a published post by `share_slug` succeeds.
- **SC-004**: One completed interview yields exactly one `interview_sessions` row
  and exactly one `interview_reports` row.
- **SC-005**: Re-running evaluation for an already-scored session produces no
  additional LLM spend.

## Assumptions

- A user belongs to at most one organization; no cross-org membership exists today.
- Supabase Auth is the sole identity provider, so `auth.uid()` is always the
  authority for identity in policy predicates.
- The backend's service-role key bypasses RLS entirely — which is precisely why
  FR-009's explicit server-side ownership checks are load-bearing, not redundant.

## Outstanding Risks

- **The production RLS policy set was applied by hand in the Supabase SQL editor
  and was never captured as a migration.** Migration `008` still creates the
  duplicate-session trigger that was dropped manually in production, so a fresh
  `supabase db push` against a clean database reproduces the broken state rather
  than the fixed one. Migration `022` (added alongside this spec) captures the
  live state; it needs review against production before being relied upon.
- `app.backend_url` must be set in Supabase for the `pg_net` webhook, and
  `pg_net` must be enabled — verify with
  `SELECT * FROM pg_extension WHERE extname = 'pg_net';`
- Cross-org isolation has no automated test. SC-001 is currently verified by hand.
