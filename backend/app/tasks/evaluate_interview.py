"""Celery task for interview evaluation pipeline."""

from __future__ import annotations

import logging

from app.config import settings
from app.interview.evaluator import evaluate_interview
from app.services import email as email_service
from app.services.supabase import get_record, update_record
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

        # Update application status based on recommendation
        session_record = get_record("interview_sessions", session_id)
        application_id = session_record.get("application_id")
        recommendation = report.get("recommendation", "")

        if application_id and recommendation:
            status_map = {
                "advance": "shortlisted",
                "borderline": "interviewed",
                "reject": "interview_rejected",
            }
            new_status = status_map.get(recommendation, "interviewed")
            update_record("applications", application_id, {"status": new_status})
            logger.info(
                "Application %s status set to '%s' based on interview evaluation",
                application_id,
                new_status,
            )

            # Send post-interview email to the candidate
            try:
                application = get_record("applications", application_id)
                candidate = get_record("candidates", application["candidate_id"])
                hiring_post = get_record("hiring_posts", application["hiring_post_id"])

                portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/portal"
                email_service.send_interview_completed(
                    candidate_email=candidate.get("email", ""),
                    candidate_name=candidate.get("full_name", ""),
                    job_title=hiring_post.get("title", "the position"),
                    recommendation=recommendation,
                    portal_url=portal_url,
                )
                logger.info("Post-interview email sent to %s", candidate.get("email"))
            except Exception:
                logger.exception("Failed to send post-interview email for application=%s", application_id)

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
