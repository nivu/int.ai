"""Pipeline health — find applications and interviews that silently failed.

Three kinds of problem, none of which the app surfaced before:

* ``screening_failed``  — screen_resume_task crashed. It resets the
  application to ``applied`` (so it can be retried) and, since migration 027,
  records ``screening_error`` / ``screening_failed_at``.
* ``screening_stuck``   — still ``applied`` well after submission with no
  recorded failure: the application-created webhook never fired, the task was
  never queued, or the Celery worker is down.
* ``evaluation_missing`` — interview ``completed`` but no ``interview_reports``
  row: evaluate_interview_task failed (it still marks the session completed
  so the candidate gets their email).

``find_issues`` feeds the dashboard's "Needs attention" list.
``run_alert_check`` emails each org's active admins about problems that
appeared since the previous check; ``alert_loop`` runs it hourly inside the
API process (not the Celery worker, so a dead worker still gets reported).
"""

from __future__ import annotations

import asyncio
import logging
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

_APP_COLUMNS = "id, hiring_post_id, created_at, candidates(full_name, email)"
_FAILURE_COLUMNS = ", screening_error, screening_failed_at"


def _embedded(value: Any) -> dict[str, Any]:
    """PostgREST returns a to-one embed as an object, sometimes as a 1-item list."""
    if isinstance(value, list):
        return value[0] if value else {}
    return value or {}


def _applied_applications(post_ids: list[str]) -> list[dict[str, Any]]:
    """Applications still in 'applied'. Falls back to the pre-027 columns if
    the failure columns do not exist yet."""

    def query(columns: str) -> list[dict[str, Any]]:
        return (
            _db()
            .table("applications")
            .select(columns)
            .in_("hiring_post_id", post_ids)
            .eq("status", "applied")
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )

    try:
        return query(_APP_COLUMNS + _FAILURE_COLUMNS)
    except Exception:
        logger.warning("screening failure columns unavailable (migration 027 not applied?)")
        return query(_APP_COLUMNS)


def _completed_sessions_without_report(
    post_ids: list[str], ended_after: datetime
) -> list[dict[str, Any]]:
    rows = (
        _db()
        .table("interview_sessions")
        .select(
            "id, application_id, ended_at, interview_reports(id), "
            "applications!inner(hiring_post_id, candidates(full_name, email))"
        )
        .eq("status", "completed")
        .gte("ended_at", ended_after.isoformat())
        .in_("applications.hiring_post_id", post_ids)
        .order("ended_at", desc=True)
        .execute()
        .data
        or []
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
        if datetime.fromisoformat(s["ended_at"]) >= stuck_before:
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
                "occurred_at": s["ended_at"],
                "detail": "Interview finished but no evaluation report was produced.",
            }
        )

    issues.sort(key=lambda i: i["occurred_at"], reverse=True)
    return issues


def _org_job_titles(org_id: str) -> dict[str, str]:
    rows = _db().table("hiring_posts").select("id, title").eq("org_id", org_id).execute().data or []
    return {r["id"]: r["title"] for r in rows}


def find_issues(org_id: str, *, now: datetime | None = None) -> list[dict[str, Any]]:
    now = now or datetime.now(UTC)
    titles = _org_job_titles(org_id)
    if not titles:
        return []
    post_ids = list(titles)
    try:
        sessions = _completed_sessions_without_report(post_ids, now - EVALUATION_LOOKBACK)
    except Exception:
        # Still report screening problems if the interview lookup breaks.
        logger.exception("Could not check interview evaluations for org=%s", org_id)
        sessions = []
    return classify(_applied_applications(post_ids), sessions, titles, now=now)


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------


def new_since(
    issues: list[dict[str, Any]], window_start: datetime, now: datetime
) -> list[dict[str, Any]]:
    """Issues that became visible in (window_start, now].

    A failure is new when it happened in the window. Stuck and missing-report
    issues become visible STUCK_AFTER after their timestamp, so they are new
    when that moment falls in the window. Checking contiguous windows reports
    each issue once.
    """
    fresh = []
    for i in issues:
        visible_at = datetime.fromisoformat(i["occurred_at"])
        if i["kind"] != "screening_failed":
            visible_at += STUCK_AFTER
        if window_start < visible_at <= now:
            fresh.append(i)
    return fresh


def _active_admin_emails(org_id: str) -> list[str]:
    members = (
        _db()
        .table("team_members")
        .select("user_id")
        .eq("org_id", org_id)
        .eq("role", "admin")
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    user_ids = {m["user_id"] for m in members}
    if not user_ids:
        return []
    return sorted(
        u.email for u in _db().auth.admin.list_users() if str(u.id) in user_ids and u.email
    )


def run_alert_check(window_start: datetime, now: datetime) -> int:
    """Email each org's admins about issues new in the window. Returns emails sent."""
    from app.services import email as email_service

    org_ids = {
        r["org_id"]
        for r in (_db().table("hiring_posts").select("org_id").execute().data or [])
        if r["org_id"]
    }
    sent = 0
    for org_id in sorted(org_ids):
        try:
            fresh = new_since(find_issues(org_id, now=now), window_start, now)
            if not fresh:
                continue
            recipients = _active_admin_emails(org_id)
            if not recipients:
                logger.warning("Pipeline issues in org=%s but no active admin to alert", org_id)
                continue
            email_service.send_pipeline_alert(recipients, fresh)
            sent += 1
            logger.info(
                '{"event": "pipeline_alert_sent", "org_id": "%s", "issues": %d, "recipients": %d}',
                org_id,
                len(fresh),
                len(recipients),
            )
        except Exception:
            logger.exception("Pipeline alert check failed for org=%s", org_id)
    return sent


async def alert_loop() -> None:
    """Run ``run_alert_check`` every hour over back-to-back windows."""
    window_start = datetime.now(UTC) - timedelta(seconds=ALERT_INTERVAL_SECONDS)
    while True:
        await asyncio.sleep(ALERT_INTERVAL_SECONDS)
        now = datetime.now(UTC)
        try:
            await asyncio.to_thread(run_alert_check, window_start, now)
        except Exception:
            logger.exception("Pipeline alert check failed")
        window_start = now
