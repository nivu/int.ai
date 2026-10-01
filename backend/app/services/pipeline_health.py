"""Pipeline health — find applications and interviews that silently failed.

Three kinds of problem, none of which the app surfaced before:

* ``screening_failed``  — screen_resume_task crashed. It resets the
  application to ``applied`` (so it can be retried) and, since migration 027,
  records ``screening_error`` / ``screening_failed_at``.
* ``screening_stuck``   — still ``applied`` well after submission with no
  recorded failure: the application-created webhook never fired, the task was
  never queued, or the Celery worker is down.
* ``evaluation_missing`` — interview ``completed`` but no ``interview_reports``
  row: evaluate_interview_task failed or was never queued. Sessions ended
  from the candidate's End button have no ``ended_at``, so ``started_at`` is
  used for them.

``find_issues`` feeds the dashboard's "Needs attention" list.
``run_alert_check`` emails each org's active admins about issues they have
not been told about yet; ``alert_loop`` runs it hourly inside the API process
(not the Celery worker, so a dead worker still gets reported). Which issues
were already alerted is kept in Redis, so restarts and extra API replicas
neither repeat nor drop alerts.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

logger = logging.getLogger("int.ai")


def _db():
    # Imported lazily so the pure helpers here can be unit-tested without
    # Supabase credentials in the environment.
    from app.services.supabase import supabase

    return supabase


# Screening and evaluation tasks are capped at 10 minutes (task_time_limit).
STUCK_AFTER = timedelta(minutes=15)
# Completed interviews older than this without a report are not listed; they
# predate evaluation or were already handled by hand.
EVALUATION_LOOKBACK = timedelta(days=30)
ALERT_INTERVAL_SECONDS = 3600
ALERT_FIRST_RUN_DELAY_SECONDS = 60

_PAGE_SIZE = 1000  # PostgREST's default max rows per response
_APP_COLUMNS = (
    "id, hiring_post_id, created_at, candidates(full_name, email), hiring_posts!inner(org_id)"
)
_FAILURE_COLUMNS = ", screening_error, screening_failed_at"

_ALERT_LOCK_KEY = "pipeline_alerts:lock"
_ALERT_SENT_KEY = "pipeline_alerts:sent:{org_id}"


def _all_rows(build: Callable[[], Any]) -> list[dict[str, Any]]:
    """Page through a query; ``build`` must return a fresh, totally ordered query."""
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        page = build().range(start, start + _PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            return rows
        start += _PAGE_SIZE


def _embedded(value: Any) -> dict[str, Any]:
    """PostgREST returns a to-one embed as an object, sometimes as a 1-item list."""
    if isinstance(value, list):
        return value[0] if value else {}
    return value or {}


def _applied_applications(org_id: str) -> list[dict[str, Any]]:
    """The org's applications still in 'applied'. Falls back to the pre-027
    columns if the failure columns do not exist yet."""

    def query(columns: str) -> list[dict[str, Any]]:
        return _all_rows(
            lambda: (
                _db()
                .table("applications")
                .select(columns)
                .eq("hiring_posts.org_id", org_id)
                .eq("status", "applied")
                .order("id")
            )
        )

    try:
        return query(_APP_COLUMNS + _FAILURE_COLUMNS)
    except Exception:
        logger.warning("screening failure columns unavailable (migration 027 not applied?)")
        return query(_APP_COLUMNS)


def _completed_sessions_without_report(org_id: str, since: datetime) -> list[dict[str, Any]]:
    cutoff = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = _all_rows(
        lambda: (
            _db()
            .table("interview_sessions")
            .select(
                "id, application_id, started_at, ended_at, interview_reports(id), "
                "applications!inner(hiring_post_id, candidates(full_name, email), hiring_posts!inner(org_id))"
            )
            .eq("status", "completed")
            .eq("applications.hiring_posts.org_id", org_id)
            .or_(f"ended_at.gte.{cutoff},and(ended_at.is.null,started_at.gte.{cutoff})")
            .order("id")
        )
    )
    return [r for r in rows if not _embedded(r.get("interview_reports"))]


def classify(
    applications: list[dict[str, Any]],
    sessions: list[dict[str, Any]],
    job_titles: dict[str, str],
    *,
    now: datetime,
) -> list[dict[str, Any]]:
    """Turn raw rows into issue dicts, newest first. Pure: no database access."""
    issues: list[dict[str, Any]] = []
    stuck_before = now - STUCK_AFTER

    for a in applications:
        candidate = _embedded(a.get("candidates"))
        base = {
            "application_id": a["id"],
            "hiring_post_id": a["hiring_post_id"],
            "job_title": job_titles.get(a["hiring_post_id"], "Unknown job"),
            "candidate_name": candidate.get("full_name")
            or candidate.get("email")
            or "Unknown candidate",
            "session_id": None,
        }
        if a.get("screening_failed_at"):
            issues.append(
                {
                    **base,
                    "kind": "screening_failed",
                    "occurred_at": a["screening_failed_at"],
                    "detail": a.get("screening_error") or "Resume screening failed.",
                }
            )
        elif datetime.fromisoformat(a["created_at"]) < stuck_before:
            issues.append(
                {
                    **base,
                    "kind": "screening_stuck",
                    "occurred_at": a["created_at"],
                    "detail": "Submitted but never screened. The screening job did not start or did not finish.",
                }
            )

    for s in sessions:
        occurred_at = s.get("ended_at") or s.get("started_at")
        if not occurred_at or datetime.fromisoformat(occurred_at) >= stuck_before:
            continue  # evaluation may still be running
        application = _embedded(s.get("applications"))
        candidate = _embedded(application.get("candidates"))
        issues.append(
            {
                "kind": "evaluation_missing",
                "application_id": s["application_id"],
                "hiring_post_id": application.get("hiring_post_id"),
                "job_title": job_titles.get(application.get("hiring_post_id", ""), "Unknown job"),
                "candidate_name": candidate.get("full_name")
                or candidate.get("email")
                or "Unknown candidate",
                "session_id": s["id"],
                "occurred_at": occurred_at,
                "detail": "Interview finished but no evaluation report was produced.",
            }
        )

    issues.sort(key=lambda i: i["occurred_at"], reverse=True)
    return issues


def _org_job_titles(org_id: str) -> dict[str, str]:
    rows = _all_rows(
        lambda: _db().table("hiring_posts").select("id, title").eq("org_id", org_id).order("id")
    )
    return {r["id"]: r["title"] for r in rows}


def find_issues(
    org_id: str, *, now: datetime | None = None, strict: bool = False
) -> list[dict[str, Any]]:
    """All current issues for an org.

    ``strict`` re-raises a failed interview lookup instead of returning the
    screening issues alone; the alert check needs the complete set, the
    dashboard prefers a partial answer.
    """
    now = now or datetime.now(UTC)
    titles = _org_job_titles(org_id)
    if not titles:
        return []
    try:
        sessions = _completed_sessions_without_report(org_id, now - EVALUATION_LOOKBACK)
    except Exception:
        if strict:
            raise
        logger.exception("Could not check interview evaluations for org=%s", org_id)
        sessions = []
    return classify(_applied_applications(org_id), sessions, titles, now=now)


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------


def issue_key(issue: dict[str, Any]) -> str:
    """Stable identity for alert de-duplication. A repeat screening failure
    has a new timestamp, so it is a new issue and is alerted again."""
    if issue["kind"] == "screening_failed":
        return f"screening_failed:{issue['application_id']}:{issue['occurred_at']}"
    if issue["kind"] == "evaluation_missing":
        return f"evaluation_missing:{issue['session_id']}"
    return f"{issue['kind']}:{issue['application_id']}"


def unalerted(issues: list[dict[str, Any]], already_alerted: set[str]) -> list[dict[str, Any]]:
    return [i for i in issues if issue_key(i) not in already_alerted]


def _redis():
    import redis

    from app.config import settings

    url = str(settings.REDIS_URL)
    kwargs: dict[str, Any] = {"decode_responses": True}
    if url.startswith("rediss://"):
        kwargs["ssl_cert_reqs"] = None  # matches app/worker.py
    return redis.Redis.from_url(url, **kwargs)


def _auth_emails() -> dict[str, str]:
    """user_id -> email for every auth user (GoTrue pages list_users)."""
    emails: dict[str, str] = {}
    for page in range(1, 1000):
        users = _db().auth.admin.list_users(page=page, per_page=1000)
        if not users:
            break
        emails.update({str(u.id): u.email or "" for u in users})
    return emails


def _active_admin_user_ids(org_id: str) -> set[str]:
    rows = _all_rows(
        lambda: (
            _db()
            .table("team_members")
            .select("user_id")
            .eq("org_id", org_id)
            .eq("role", "admin")
            .eq("status", "active")
            .order("user_id")
        )
    )
    return {r["user_id"] for r in rows}


def run_alert_check() -> int:
    """Email each org's admins about issues not alerted before. Returns emails sent."""
    from app.services import email as email_service

    r = _redis()
    # One check at a time across API processes and replicas.
    if not r.set(_ALERT_LOCK_KEY, "1", nx=True, ex=15 * 60):
        logger.info("Pipeline alert check already running elsewhere; skipping")
        return 0
    try:
        org_ids = [
            o["id"]
            for o in _all_rows(lambda: _db().table("organizations").select("id").order("id"))
        ]
        emails: dict[str, str] | None = None
        sent = 0
        for org_id in org_ids:
            try:
                issues = find_issues(org_id, strict=True)
                sent_key = _ALERT_SENT_KEY.format(org_id=org_id)
                fresh = unalerted(issues, r.smembers(sent_key))
                if fresh:
                    if emails is None:
                        emails = _auth_emails()
                    recipients = sorted(
                        emails[uid] for uid in _active_admin_user_ids(org_id) if emails.get(uid)
                    )
                    if not recipients:
                        logger.warning(
                            "Pipeline issues in org=%s but no active admin to alert", org_id
                        )
                        continue  # not recorded as alerted; retried next hour
                    email_service.send_pipeline_alert(recipients, fresh)
                    sent += 1
                    logger.info(
                        '{"event": "pipeline_alert_sent", "org_id": "%s", "issues": %d, "recipients": %d}',
                        org_id,
                        len(fresh),
                        len(recipients),
                    )
                # Remember exactly the current issues: resolved ones drop out,
                # so if one recurs it is alerted again.
                pipe = r.pipeline()
                pipe.delete(sent_key)
                if issues:
                    pipe.sadd(sent_key, *(issue_key(i) for i in issues))
                pipe.execute()
            except Exception:
                # Nothing recorded for this org, so its issues are retried next hour.
                logger.exception("Pipeline alert check failed for org=%s", org_id)
        return sent
    finally:
        r.delete(_ALERT_LOCK_KEY)


async def alert_loop() -> None:
    """Run ``run_alert_check`` shortly after start-up, then hourly."""
    await asyncio.sleep(ALERT_FIRST_RUN_DELAY_SECONDS)
    while True:
        try:
            await asyncio.to_thread(run_alert_check)
        except Exception:
            logger.exception("Pipeline alert check failed")
        await asyncio.sleep(ALERT_INTERVAL_SECONDS)
