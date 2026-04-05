"""Webhook endpoints for Supabase database webhooks."""

import logging
from typing import Any

from fastapi import APIRouter

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookPayload:
    """Supabase database webhook payload shape."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.type: str = data.get("type", "")
        self.table: str = data.get("table", "")
        self.record: dict[str, Any] = data.get("record", {})
        self.old_record: dict[str, Any] = data.get("old_record", {})


@router.post("/application-created")
async def application_created(payload: dict[str, Any]) -> dict[str, str]:
    """Handle Supabase webhook fired when a new application row is inserted.

    Payload ``record`` is expected to contain:
    - id (application id)
    - hiring_post_id
    - candidate_id
    - resume_url
    """
    webhook = WebhookPayload(payload)
    record = webhook.record

    application_id: str | None = record.get("id")
    hiring_post_id: str | None = record.get("hiring_post_id")

    logger.info(
        "Webhook received: application-created | application_id=%s hiring_post_id=%s",
        application_id,
        hiring_post_id,
    )

    # Trigger async resume screening task if the module is available
    try:
        from app.tasks.screen_resume import screen_resume_task

        screen_resume_task.delay(application_id, hiring_post_id)
        logger.info(
            "Dispatched screen_resume_task for application_id=%s", application_id
        )
    except ImportError:
        logger.warning(
            "screen_resume task module not yet available — skipping screening dispatch "
            "for application_id=%s",
            application_id,
        )

    return {"status": "received"}


# ---------------------------------------------------------------------------
# T068 — Status change email notification webhook
# ---------------------------------------------------------------------------

NOTIFIABLE_STATUSES = {"screened", "interview_sent", "interviewed", "shortlisted", "rejected"}


@router.post("/application-status-changed")
async def application_status_changed(payload: dict[str, Any]) -> dict[str, str]:
    """Handle Supabase webhook fired when an application row is updated.

    Only sends an email when the ``status`` column actually changed and the
    new status is one of the notifiable statuses.
    """
    webhook = WebhookPayload(payload)
    old_record = webhook.old_record
    record = webhook.record

    application_id: str | None = record.get("id")
    old_status: str | None = old_record.get("status")
    new_status: str | None = record.get("status")

    logger.info(
        "Webhook received: application-status-changed | application_id=%s old=%s new=%s",
        application_id,
        old_status,
        new_status,
    )

    # Only notify when the status actually changed and is a notifiable status
    if old_status == new_status or new_status not in NOTIFIABLE_STATUSES:
        return {"status": "skipped"}

    try:
        from app.services.supabase import supabase as sb

        # Fetch candidate email & name
        candidate_id: str | None = record.get("candidate_id")
        candidate = (
            sb.table("candidates")
            .select("email, full_name")
            .eq("id", candidate_id)
            .single()
            .execute()
        )
        candidate_email: str = candidate.data["email"]
        candidate_name: str = candidate.data["full_name"]

        # Fetch job title
        hiring_post_id: str | None = record.get("hiring_post_id")
        post = (
            sb.table("hiring_posts")
            .select("title")
            .eq("id", hiring_post_id)
            .single()
            .execute()
        )
        job_title: str = post.data["title"]

        # Send email
        from app.services import email as email_service

        email_service.send_status_update(
            candidate_email=candidate_email,
            candidate_name=candidate_name,
            job_title=job_title,
            new_status=new_status,
        )

        logger.info(
            "Status-change email sent for application_id=%s to=%s new_status=%s",
            application_id,
            candidate_email,
            new_status,
        )
    except Exception:
        logger.exception(
            "Failed to send status-change email for application_id=%s",
            application_id,
        )

    return {"status": "notified"}
