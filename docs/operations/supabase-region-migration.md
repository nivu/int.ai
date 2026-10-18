# Supabase region migration: Sydney → Singapore

**Status (2026-10-18):** **Cut over.** Production runs on `int.ai-sg`
(`urwqqjqkvalpofqvvvok`, `ap-southeast-1` Singapore) since 11:14 UTC. The
old Sydney project (`zwxmmwzpwaewuzduvoqg`) is untouched and kept as the
fallback; it received no writes after the final dump at 11:09 UTC. Step 6
(watch for a few days, then pause the old project) is still open.

Post-cut-over checks passed: live backend on Singapore (one-row query
34–125 ms, auth check 51–102 ms, down from 208–652 / 208–269 ms), MCP
`list_jobs` / `get_pipeline_status` working, celery connected, LiveKit agent
registered, the live site bundle referencing only the new project, and the
database → backend path (`pg_net` → `/health` = 200). **Still to verify with
real use:** a new application being screened and a live voice interview.

## Why

Every service that talks to the database runs in Singapore, but the database
is in Sydney:

| Part | Host | Region |
|---|---|---|
| Frontend server code | Netlify Functions (site `intai`) | `ap-southeast-1` Singapore |
| API, Celery worker, LiveKit agent | Railway (project `amused-peace`) | `asia-southeast1` Singapore |
| Database, Auth, Storage | Supabase project `int.ai` (`zwxmmwzpwaewuzduvoqg`) | `ap-southeast-2` **Sydney** |

Measured from inside the production API container (2026-10-18):

- Supabase's own processing time (`x-envoy-upstream-service-time`): **0–6 ms**
- Total time per request seen by the API: **~210 ms**, with spikes to ~580 ms
- A health check that never touches the database also takes ~212 ms

So ~200 ms of every database call is network distance. Pages make several
calls one after another: the candidate interview page makes ~8–9 calls
(2.5–4 s today), and the admin "Needs attention" list makes 5 (~2 s).

Supabase cannot change an existing project's region, so this is a move to a
new project in `ap-southeast-1` Singapore.

## What has to move

| Item | Where it is defined | How it moves |
|---|---|---|
| Schema (34 migrations) | `supabase/migrations/` | `supabase db push` to the new project, or included in the dump |
| Extensions: `vector`, `pg_net`, `pg_cron` | migrations 001/009/034 | Created by the migrations |
| Table data | live database | `pg_dump --data-only` → restore |
| Auth users (IDs, password hashes) | `auth` schema | Dumped with the data. **User IDs must be kept**: `team_members.user_id` and `candidates.auth_user_id` reference them |
| Screening webhook: dashboard Database Webhook `application-created` (`supabase_functions.http_request` → `/api/v1/webhooks/application-created`, URL hardcoded) | not in any migration (see 018) | Included in the schema dump; needs Database Webhooks enabled on the new project first |
| Cron job `auto-close-expired-posts` | migration 034 | Re-run the `cron.schedule` from 034 after restore and check `cron.job` |
| Storage buckets `resumes`, `photos`, `exports` + policies | migration 033 | Buckets/policies from the migration; **objects copied separately** |
| Realtime publication (jobs and candidates live lists) | **not in any migration** (enabled by hand in the dashboard) | List the tables in `supabase_realtime` on the old project and re-enable the same ones |
| Auth settings: site URL, redirect URLs, email OTP template, SMTP | Supabase dashboard | Copy by hand (screenshot the old settings first) |
| API keys (URL, anon key, service-role key) | Railway ×3, Netlify, local `.env` files | Replace with the new project's values |

Env vars that change:

- Railway `int.ai`, `celery`, `LiveKit`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Netlify `intai`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (baked in at build time, so a **rebuild** is needed, not only a restart)
- Local: `backend/.env`, `frontend/.env.local` (local dev points at prod Supabase)

## What users will notice

- **Downtime window**: no applying, no interviews, no dashboard while the data is copied.
- **Everyone signs in again.** The new project signs login tokens with
  different keys, so existing sessions stop working. Passwords and accounts
  carry over. (Verify in Step 1 whether the old signing key can be reused;
  if it can, this goes away.)
- Interview invite links and the client invite (Fluxbooks, sent 2026-10-18)
  use tokens stored in our own tables, so they should keep working. Verify in Step 6.

## Steps

Each step: explain → approve → do → show the result → approve the next one.

### Step 0: Pre-flight (read-only, no downtime)

1. Record the database size and row counts per table (the baseline for checking the copy).
2. Record storage object counts and total size per bucket.
3. List the tables in the `supabase_realtime` publication.
4. List `cron.job` rows.
5. Screenshot Auth settings: site URL, redirect URLs, email templates, SMTP, rate limits.
6. Check the Supabase plan and the cost of running two projects in parallel during the move.

### Step 1: Create the new project (no downtime)

1. Create a Supabase project in `ap-southeast-1` Singapore, same plan and compute size.
2. Check whether the old project's login signing key can be reused (decides whether users must sign in again).
3. Apply all migrations: `supabase db push` against the new project.
4. Re-enable the Realtime tables from Step 0.3 and copy the Auth settings from Step 0.5.

### Step 2: Rehearsal copy (no downtime)

1. Dump the data and auth users from the old project and restore them into the new one.
2. Copy all storage objects.
3. Compare row and object counts with Step 0.
4. Point a **local** frontend and backend at the new project and run through:
   admin login, job list, candidate list, resume download, apply form,
   candidate OTP login, interview page loading.
5. Time the same requests as on 2026-10-18 to confirm the speed-up.
6. Wipe the new project's data afterwards. The real copy happens in Step 4.

### Step 3: Announce the window

Pick a low-traffic time (no interviews scheduled, no open deadline that day)
and tell admins and the client in advance.

### Step 4: Cut-over (downtime starts)

1. Stop writes: stop the Railway API (`int.ai`) and scale `celery` and
   `LiveKit` to 0, put the frontend into maintenance (or pause the Netlify
   site), and unschedule the old project's `auto-close-expired-posts` cron
   (`select cron.unschedule('auto-close-expired-posts')`).
2. Final dump and restore of data and auth users, then the storage sync.
3. Check row and object counts against the old project.
4. Re-run the `cron.schedule` from migration 034 on the new project and check
   that the `application-created` Database Webhook points at
   `https://intai-production.up.railway.app/api/v1/webhooks/application-created`.
5. Update the env vars on Railway (×3) and Netlify, then redeploy Railway and rebuild Netlify.
6. Bring `celery` and `LiveKit` back up.

### Step 5: Verify (downtime ends when this passes)

1. Admin login, job list, candidates, Realtime updates on the jobs page.
2. Submit a test application → the screening trigger fires → screening completes.
3. Candidate OTP login → the interview page loads → (optional) a short test interview.
4. Client portal: Fluxbooks job view and resume download.
5. MCP connector: `list_jobs` works.
6. Re-run the timing check from the Railway container.

### Step 6: Watch, then retire the old project

1. Watch errors and pipeline issues for a few days.
2. Update local `.env` files.
3. Keep the old Sydney project paused (not deleted) for at least 2 weeks.
4. Update `docs/` and `CLAUDE.md` references to the project ref and region.

## Rehearsal results (2026-10-18)

**Speed**, measured from inside the production Railway container (6 calls each):

| | Health check (no DB) | One-row query |
|---|---|---|
| Sydney (current) | 219–541 ms | 208–652 ms |
| Singapore (new) | 21–254 ms (first call), then 21–55 ms | 21–64 ms |

**Copy check:** exact row counts match on all 18 checked tables (including
`auth.users` = 40 and `auth.identities` = 40). Storage matches: `resumes`
247 files / 105 MB, `photos` 17 / 3.4 MB, `exports` 1 / 6 MB.

**End-to-end checks** (local backend on the copy, with an isolated Redis,
pipeline alerts off and a dummy Resend key):

- Admin signs in with their original user ID; the job list and candidate list
  (RLS) match their org; another org's job is invisible
- `GET /pipeline/issues`, `POST /interview/link-candidate` and
  `GET /interview/my-session` return 200
- Resume download through `GET /applications/{id}/resume` works (3/3).
  Direct storage signing with a user token is blocked, as intended by migration 033
- A Fluxbooks client user sees exactly their one granted job
- `public_job_status` RPC (apply links) is callable anonymously
- Auth settings (templates, subjects, OTP length, SMTP) match production

**Not tested in rehearsal:** the screening webhook firing to the real backend
(the copy's webhook points at a dead address so tests could not hit
production), a live voice interview, the MCP connector (needs a raw API key),
and the frontend in a browser. All of these are covered in Step 5.

**What production really looks like** (this differs from the migration files):

- The screening webhook is a dashboard **Database Webhook** named
  `application-created` (`supabase_functions.http_request`, hardcoded to
  `https://intai-production.up.railway.app/api/v1/webhooks/application-created`).
  `app_config` no longer exists (dropped by migration 018).
- **Realtime: no tables are in the `supabase_realtime` publication**, so the
  frontend's live-update subscriptions currently receive nothing. Nothing to
  migrate. This is a separate issue to look into.
- Buckets `recordings` and `transcripts` exist but are in no migration (both empty).
- The production auth `site_url` is `http://localhost:3000` with no redirect
  list. The app uses OTP codes, not links, so this works, but it is copied as-is.

## Cut-over runbook (tested in rehearsal)

Prerequisites: Docker, the Supabase CLI linked to the old project, the new
project's DB password and keys.

1. **Freeze writes.** Scale Railway `celery` and `LiveKit` to 0 and pause the
   Netlify site (or deploy a maintenance page).
2. **Empty the new project's rehearsal data.** Truncate the `public` tables and
   `auth.users` (cascade), delete the storage objects, or simply delete
   `int.ai-sg` and create a fresh project (Step 1 again: enable Database
   Webhooks via `POST /v1/projects/{ref}/database/webhooks/enable` and copy
   the auth config).
3. **Dump** from the old project:
   `supabase db dump --linked --role-only -f roles.sql`,
   `supabase db dump --linked -f schema.sql`,
   `supabase db dump --linked --data-only --use-copy -f data.sql`.
4. **Filter `data.sql`**: remove the COPY blocks for `storage.objects`,
   `storage.buckets_analytics`, `storage.buckets_vectors`,
   `storage.vector_indexes`, `storage.s3_multipart_uploads` and
   `storage.s3_multipart_uploads_parts`. The internal ones are not writable,
   and object rows are recreated by the file copy.
5. **Restore** (Docker `postgres:17`, session pooler
   `aws-0-ap-southeast-1.pooler.supabase.com:5432`, user
   `postgres.<new ref>`):
   `psql --single-transaction -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data_filtered.sql`
6. **Copy storage files** through the Storage API (list → download from old →
   upload to new with the same path and content-type).
7. **Recreate the cron job**:
   `select cron.schedule('auto-close-expired-posts', '*/15 * * * *', 'SELECT public.auto_close_expired_posts()')`.
8. **Auth config**: copy it with the Management API. The SMTP password comes
   back as a hash, so set `smtp_pass` to the Resend API key explicitly.
9. **Verify counts** (same queries as in the rehearsal).
10. **Env vars**: Railway `int.ai`, `celery`, `LiveKit` → `SUPABASE_URL`,
    `SUPABASE_SERVICE_ROLE_KEY`; Netlify → `NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then trigger a rebuild. Update local `.env` files.
11. Bring `celery` and `LiveKit` back up, unpause Netlify, then Step 5.

Learned at the real cut-over. Both are needed on any fresh project:

- **Function grants.** A new project's default privileges grant `EXECUTE` to
  `anon` and `authenticated` on restored functions, and the dump only revokes
  from `PUBLIC`. Revoke explicitly, as production has it:
  `REVOKE ALL ON FUNCTION public.client_post_ids_for_user(uuid) FROM anon, authenticated;`
  `REVOKE ALL ON FUNCTION public.prepare_client_account(text) FROM anon, authenticated;`
  To catch any others, diff `supabase db dump` of old vs new before switching.
- **Migration history.** `supabase_migrations.schema_migrations` is not in
  the data dump. Without it, `supabase db push` would re-run every migration.
  Run `supabase migration repair --status applied 001 … 034 --linked` and
  re-link the CLI (`supabase link --project-ref <new ref>`).

If the rehearsal project is reused instead of recreated, the schema restore
recreates the `application-created` webhook with the real production URL,
which undoes the rehearsal's dead-address override.

## Rollback

Until Step 5 passes, the old project is untouched. To roll back, set the
env vars on Railway and Netlify back to the old values and redeploy. Anything
written to the new project after the cut-over (applications, interviews)
would have to be copied back by hand, so decide on rollback quickly. Rolling
back after a few hours of real traffic is much more costly.

## Not covered by this move

Each page still makes several database calls one after another. With the
database close by, that matters much less (a few ms each instead of ~200 ms),
but reducing the number of calls on `my-session` and `pipeline/issues`
remains a separate, optional improvement.
