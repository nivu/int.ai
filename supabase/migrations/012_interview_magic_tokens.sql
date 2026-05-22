-- Magic link tokens for interview invitations.
-- Each token is a single-use, time-limited credential that authenticates
-- a candidate directly into their interview without requiring OTP.

create table if not exists interview_magic_tokens (
    id              uuid primary key default gen_random_uuid(),
    token           text not null unique,
    candidate_email text not null,
    application_id  uuid not null references applications(id) on delete cascade,
    expires_at      timestamptz not null,
    used_at         timestamptz,
    created_at      timestamptz not null default now()
);

-- Index for fast token lookups on click
create index if not exists idx_interview_magic_tokens_token
    on interview_magic_tokens(token);

-- Only the service role can read/write tokens (bypasses RLS)
alter table interview_magic_tokens enable row level security;

-- No public access — all access goes through the backend service role
create policy "service role only"
    on interview_magic_tokens
    for all
    to service_role
    using (true)
    with check (true);
