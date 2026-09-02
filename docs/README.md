# int.ai Documentation

Living documentation. Anything here is expected to describe how the system
works **now** — if a document becomes a record of a past change instead, it
belongs in [`archive/`](archive/).

Specifications live in [`../specs/`](../specs/), not here. See
[Where things go](#where-things-go) below.

## Architecture

| Document | Covers |
|---|---|
| [architecture/recruiter-platform.md](architecture/recruiter-platform.md) | Full system diagram — Next.js routes, proxy layer, FastAPI endpoints, Celery tasks, scoring services |

## Guides

| Document | Covers |
|---|---|
| [guides/interview-testing.md](guides/interview-testing.md) | End-to-end testing of the interview system |
| [guides/tokens-and-expiry.md](guides/tokens-and-expiry.md) | Every token type in the platform and its lifetime |
| [guides/timer-validation-tests.md](guides/timer-validation-tests.md) | Running the interview timer logic test suite |

## Operations

| Document | Covers |
|---|---|
| [operations/celery-worker.md](operations/celery-worker.md) | Celery worker quick start |
| [operations/worker-restart.md](operations/worker-restart.md) | Worker auto-restart setup |
| [operations/worker-deployment.md](operations/worker-deployment.md) | Deploying the worker |
| [operations/redis-persistence.md](operations/redis-persistence.md) | Redis persistence configuration |

## Where things go

This repo follows [spec-kit](https://github.com/github/spec-kit). Four homes,
and the distinction matters:

| Content | Home |
|---|---|
| Project principles and non-negotiables | `.specify/memory/constitution.md` |
| What a feature must do, and why | `specs/NNN-feature-slug/spec.md` |
| How the system works today | `docs/` (here) |
| A record of a change that already shipped | `docs/archive/` — or better, the commit message |

The failure mode this structure exists to prevent: a fix gets written up as a
standalone `SOMETHING_FIX.md`, the behavior it describes becomes permanent, and
the spec never learns about it. **If a fix changes what the system is supposed
to do, update the spec.** The writeup is scaffolding; the spec is the artifact.

### Adding a feature

```bash
.specify/scripts/bash/create-new-feature.sh "Short description" --short-name "slug"
```

This creates `specs/NNN-slug/` and the matching branch. Fill in `spec.md` from
`.specify/templates/spec-template.md`.

## Current specs

| Spec | Status |
|---|---|
| [001-hiring-automation-platform](../specs/001-hiring-automation-platform/spec.md) | Shipped — screening + voice interviews |
| [002-multi-org-isolation](../specs/002-multi-org-isolation/spec.md) | As-built, retroactively specified — org isolation, RLS, roles |
