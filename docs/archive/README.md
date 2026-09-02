# Archive

Point-in-time reports: fix writeups, status snapshots, and session logs that
described the system at a moment that has passed. They are kept because they
explain *why* some non-obvious code exists, and because a few contain root-cause
analysis that is genuinely hard to reconstruct.

**Do not treat anything here as current.** For how the system works now, see
[`../README.md`](../README.md). For what it is supposed to do, see
[`../../specs/`](../../specs/).

Nothing outside this folder links into it. Adding a new file here is almost
always the wrong move — see [Where things go](../README.md#where-things-go).

## `2026-05-interview-tuning/` — 16 files

Iterative tuning of the voice interviewer: timer freeze/resume, grace periods,
tiered silence thresholds, VAD turn detection, premature question advancement,
repeat handling.

**Superseded by** `specs/001-hiring-automation-platform/spec.md` §Interview
Session Behavior, which absorbed these behaviors as requirements. The spec is
authoritative where the two disagree.

## `2026-05-spec-migration/` — 5 files

The paper trail of that absorption — compliance audits comparing the original
spec against the working implementation, and the plan for reconciling them.
Useful as a record of *why* the spec was rewritten to match the code rather than
the reverse.

## `2026-05-status-reports/` — 10 files

Deployment confirmations, "all services running" snapshots, a CEO update, and
several small frontend/email fixes. Almost entirely historical.

## `2026-06-bug-fixes/` — 12 files

A numbered bug-fix campaign: timer resume, tab-switch detection, AI interview
summary, candidate name priority, Redis persistence (bug 7), plus the rollback
summary and verification checklist for the batch.

**Partly superseded** — tab-switch and summary behavior reached
`specs/001`; the Redis persistence setup is live at
[`../operations/redis-persistence.md`](../operations/redis-persistence.md).

## Not archived

The 2026-07-04 multi-org session log was **not** filed here. It documented
shipped behavior that no spec covered, so it became
[`specs/002-multi-org-isolation/research.md`](../../specs/002-multi-org-isolation/research.md)
and the source for that feature's spec.
