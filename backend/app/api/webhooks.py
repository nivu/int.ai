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
