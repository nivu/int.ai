"""Celery task for interview evaluation pipeline."""

from __future__ import annotations

import logging

from app.interview.evaluator import evaluate_interview
from app.services.supabase import update_record
from app.worker import celery_app

logger = logging.getLogger("int.ai")


@celery_app.task(bind=True, name="evaluate_interview_task", max_retries=1)
def evaluate_interview_task(self, session_id: str) -> dict:
    """Run the full interview evaluation pipeline for a completed session.

    On success, updates the related application's ``decision`` field based on
    the recommendation (advance / borderline / reject).

    On failure, logs the error and marks the session status as
    ``evaluation_error``.
    """
    try:
        report = evaluate_interview(session_id)

        # Update application decision based on recommendation
        # Get application_id from the session record
        from app.services.supabase import get_record
        session_record = get_record("interview_sessions", session_id)
        application_id = session_record.get("application_id")
        recommendation = report.get("recommendation", "")

        if application_id and recommendation:
            status_map = {
                "advance": "shortlisted",
                "borderline": "interviewed",
                "reject": "rejected",
            }
            new_status = status_map.get(recommendation, "interviewed")
            update_record("applications", application_id, {"status": new_status})
            logger.info(
                "Application %s status set to '%s' based on interview evaluation",
                application_id,
                new_status,
            )

        return {
            "session_id": session_id,
            "report_id": report.get("id"),
            "recommendation": recommendation,
            "status": "completed",
        }

    except Exception as exc:
        logger.exception(
            "Interview evaluation failed for session=%s", session_id
        )
        try:
            update_record("interview_sessions", session_id, {
                "status": "completed",
            })
        except Exception:
            logger.exception(
                "Failed to update session error status for %s", session_id
            )
        raise
