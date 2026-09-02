# Data Model: Multi-Organization Isolation

Companion to `spec.md`. Describes the access-control model as built, not the
base table columns — those live in `specs/001-hiring-automation-platform/data-model.md`
and `supabase/migrations/001_initial_schema.sql`.

## Ownership graph

Every protected row resolves to exactly one `org_id`. Most do so indirectly:

```
organizations (org_id)
    ├── team_members         (org_id, user_id, role, status)   ← access authority
    ├── interview_templates  (org_id)
    ├── invite_tokens        (org_id)
    └── hiring_posts         (org_id, share_slug)
            └── applications (hiring_post_id, candidate_id)
                    ├── candidates    (auth_user_id)  ← also self-accessible
                    ├── resume_data   (application_id)
                    └── interview_sessions (application_id)
                            ├── interview_qa      (session_id)
                            └── interview_reports (session_id, share_token,
                                                   share_expires_at)
```

Two access paths exist and must not be conflated:

| Path | Predicate root | Used by |
|---|---|---|
| **Staff** | `team_members.user_id = auth.uid()` | admin, recruiter |
| **Self** | `candidates.auth_user_id = auth.uid()` | candidate portal |
| **Token** | `share_token` + expiry | external report viewers |
| **Anonymous** | `auth.uid() IS NULL` + `share_slug` | public `/apply` page |

## Access-control functions

Policies delegate every membership decision to these `SECURITY DEFINER`
functions. This is the load-bearing design choice: a `SECURITY DEFINER` function
runs as its owner and does **not** re-enter RLS, which is what breaks the
recursion that previously took down login (see `research.md`).

| Function | Returns true when the caller… |
|---|---|
| `is_org_admin(p_org_id)` | is an `active` `admin` of that org |
| `is_org_member(p_org_id)` | is an `active` `admin` or `recruiter` of that org |
| `can_staff_see_application(p_application_id)` | is org staff for that application's post |
| `can_staff_see_candidate(p_candidate_id)` | is org staff for any of that candidate's applications |
| `can_staff_see_session(p_application_id)` | is org staff for that session's application |

All five are declared `LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public`.
The pinned `search_path` is a security requirement (FR-003), not a style choice.

## Policy matrix

| Table | Policy | Command | Predicate |
|---|---|---|---|
| `organizations` | `org_admin_all` | ALL | `is_org_admin(id)` |
| | `org_recruiter_select` | SELECT | `is_org_member(id)` |
| `team_members` | `tm_self_select` | SELECT | `user_id = auth.uid()` — **must stay non-recursive** |
| | `tm_admin_all` | ALL | `is_org_admin(org_id)` |
| `interview_templates` | `it_admin_all` | ALL | `is_org_admin(org_id)` |
| | `it_recruiter_select` | SELECT | `is_org_member(org_id)` |
| `hiring_posts` | `hp_admin_all` | ALL | `is_org_admin(org_id)` |
| | `hp_recruiter_select` | SELECT | `is_org_member(org_id)` |
| | `hp_anon_published_select` | SELECT | `status='published' AND share_slug IS NOT NULL AND auth.uid() IS NULL` |
| `applications` | `app_admin_all` | ALL | `can_staff_see_application(id)` |
| | `app_recruiter_select` | SELECT | `can_staff_see_application(id)` |
| | `app_candidate_select` | SELECT | candidate self via `auth_user_id` |
| `candidates` | `cand_staff_select` | SELECT | `can_staff_see_candidate(id)` |
| | `cand_self_select` | SELECT | `auth_user_id = auth.uid()` |
| `resume_data` | `rd_staff_select` | SELECT | `can_staff_see_application(application_id)` |
| `interview_sessions` | `is_staff_select` | SELECT | `can_staff_see_session(application_id)` |
| | `is_admin_insert` | INSERT | `can_staff_see_session(application_id)` |
| | `is_candidate_select` / `is_candidate_update` | SELECT / UPDATE | candidate self via `auth_user_id` |
| `interview_qa` | `iqa_staff_select` | SELECT | staff on parent session |
| `interview_reports` | `ir_staff_select` | SELECT | staff on parent session |
| | `ir_anon_share_select` | SELECT | `share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > now())` |
| `invite_tokens` | `it_admin_all` | ALL | `is_org_admin(org_id)` |
| | `it_self_select` | SELECT | `email = (SELECT email FROM auth.users WHERE id = auth.uid())` |

> Note: `it_admin_all` is used as a policy name on **both** `interview_templates`
> and `invite_tokens`. Policy names are per-table so this is legal, but it makes
> `DROP POLICY` statements easy to misapply. Worth renaming.

## Columns added outside the migration history

`interview_reports` gained these in production via a manual `ALTER TABLE`
(see `research.md` Fix 3). The evaluator writes them; before they existed the
insert failed silently, leaving `completed` sessions with no report.

`notable_responses jsonb`, `recommendation_detail text`,
`dimension_averages jsonb`, `candidate_email_body text`,
`share_token text UNIQUE`, `share_expires_at timestamptz`

## Known drift from `supabase/migrations/`

| Live in production | Migration status |
|---|---|
| 5 `SECURITY DEFINER` functions | **absent** — captured in `022` |
| ~25 rewritten RLS policies | **absent** — captured in `022` |
| `interview_reports` extra columns | **absent** — captured in `022` |
| `auto_create_interview_session` trigger **dropped** | migration `008` still **creates** it |

A `supabase db push` against a clean database therefore reproduces the
pre-incident state. Migration `022` exists to close this gap and needs review
against production before it is trusted.
