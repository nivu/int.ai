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
        application_id = report.get("application_id")
        recommendation = report.get("recommendation", "")

        if application_id and recommendation:
            decision_map = {
                "advance": "advance",
                "borderline": "borderline",
                "reject": "reject",
            }
            decision = decision_map.get(recommendation, recommendation)
            update_record("applications", application_id, {"decision": decision})
            logger.info(
                "Application %s decision set to '%s' based on interview evaluation",
                application_id,
                decision,
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
                "status": "evaluation_error",
                "evaluation_error": str(exc),
            })
        except Exception:
            logger.exception(
                "Failed to update session error status for %s", session_id
            )
        raise
