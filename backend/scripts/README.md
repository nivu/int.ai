# backend/scripts

One-off operational and development scripts. **Nothing here is part of the
deployed application.**

Run them from `backend/` with the venv active. The `app` package is installed
editable (`packages = ["app"]` in `pyproject.toml`), so `from app.services…`
imports resolve regardless of the script's location:

```bash
cd backend
python scripts/data/list_all_candidates.py
```

## What is *not* here

These three stay at `backend/` root because the Dockerfile `COPY`s them by name
and the Procfile invokes them. Moving them breaks the deploy:

| File | Referenced by |
|---|---|
| `start_api.py` | `Dockerfile` CMD, Procfile `web` |
| `start_worker_with_cron.py` | Procfile `worker` |
| `run_agent.py` | Procfile `agent` |

## `ops/` — process management

Worker lifecycle and local server startup.

| Script | Purpose |
|---|---|
| `manage_worker.py` | Worker start/stop/status |
| `deploy_worker.sh` | Worker deployment |
| `start_backend.sh` | Local API startup |
| `start_worker_with_autorestart.sh` | Worker with auto-restart supervision |
| `restart_worker.sh`, `quick_restart.sh`, `simple_restart.sh`, `final_restart.sh`, `production_restart.sh` | Worker restart variants |

> Those five restart scripts overlap heavily and appear to be iterations on one
> idea rather than five distinct procedures. Worth collapsing into one script
> with a flag; left as found to avoid changing behavior during a file move.

Prefer the `Makefile` at `backend/` root for routine work — `make worker-start`,
`make worker-restart`, `make worker-status`, `make docker-up`.

## `data/` — one-off data operations

**These mutate production data.** Read before running.

| Script | Purpose |
|---|---|
| `list_all_candidates.py` | List candidates |
| `check_candidate_applications.py` | Inspect a candidate's applications |
| `delete_candidate.py`, `delete_candidate_direct.py`, `delete_candidates_batch.py` | Candidate deletion |
| `delete_test_candidate.py`, `delete_test_candidate_auto.py` | Test-candidate cleanup |
| `delete_users_batch.py` | Bulk auth-user deletion |
| `reset_interview.py` | Reset an interview session |
| `send_interview_invitation.py` | Manually send an interview invite |
| `send_email_only.py` | Send an email without side effects |

## `simulations/` — end-to-end exercises

Drive the pipeline without a real candidate. Useful for reproducing timing and
scoring behavior.

| Script | Purpose |
|---|---|
| `simulate_e2e.py` | Full application → screening → interview → report |
| `simulate_interview.py` | Interview session only |
| `simulate_scoring_speed.py` | Scoring pipeline latency |
| `simulate_timeout.py` | Interview timeout and termination paths |

These are simulations, not tests — they are not collected by pytest and may hit
live services. Real tests live in [`../tests/`](../tests/).
