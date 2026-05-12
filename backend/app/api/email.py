"""Email API router — send transactional emails via templates."""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app.config import settings
from app.services import email as email_service

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/email", tags=["email"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class EmailTemplate(str, Enum):
    application_confirmation = "application_confirmation"
    interview_invitation = "interview_invitation"
    rejection = "rejection"
    status_update = "status_update"


class SendEmailRequest(BaseModel):
    template: EmailTemplate
    to: EmailStr
    data: dict[str, Any]


class SendEmailResponse(BaseModel):
    message_id: str
    status: str = "sent"


class BulkAttachment(BaseModel):
    filename: str
    content_type: str
    content_base64: str


class BulkCustomEmailRequest(BaseModel):
    to: list[EmailStr]
    subject: str
    body: str
    attachments: list[BulkAttachment] = []


class BulkCustomEmailResponse(BaseModel):
    sent_count: int
    failed_count: int


# ---------------------------------------------------------------------------
# RFC 7807 problem detail helper
# ---------------------------------------------------------------------------

def _problem_response(status: int, title: str, detail: str) -> dict[str, Any]:
    return {
        "type": "about:blank",
        "title": title,
        "status": status,
        "detail": detail,
    }


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

class ApplicationConfirmationRequest(BaseModel):
    candidate_email: EmailStr
    candidate_name: str
    hiring_post_id: str
    share_slug: str


@router.post("/application-confirmation")
async def send_application_confirmation(body: ApplicationConfirmationRequest) -> dict[str, str]:
    """Send application confirmation email to a candidate."""
    from app.services.supabase import get_record

    try:
        hiring_post = get_record("hiring_posts", body.hiring_post_id)
        job_title = hiring_post.get("title", "the position")
    except Exception:
        job_title = "the position"

    portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/portal"

    try:
        message_id = email_service.send_confirmation(
            candidate_email=body.candidate_email,
            candidate_name=body.candidate_name,
            job_title=job_title,
            portal_url=portal_url,
        )
        return {"message_id": message_id, "status": "sent"}
    except Exception as exc:
        logger.exception("Failed to send application confirmation email")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/send", response_model=SendEmailResponse)
async def send_email(body: SendEmailRequest) -> SendEmailResponse:
    """Dispatch a transactional email using a named template."""
    try:
        data = body.data
        candidate_name: str = data["candidate_name"]
        job_title: str = data["job_title"]

        if body.template == EmailTemplate.application_confirmation:
            message_id = email_service.send_confirmation(
                candidate_email=body.to,
                candidate_name=candidate_name,
                job_title=job_title,
                portal_url=data["portal_url"],
            )

        elif body.template == EmailTemplate.interview_invitation:
            interview_url = data.get(
                "interview_url",
                f"{settings.FRONTEND_URL}/interview",
            )
            message_id = email_service.send_interview_invitation(
                candidate_email=body.to,
                candidate_name=candidate_name,
                job_title=job_title,
                interview_deadline=data["interview_deadline"],
                interview_url=interview_url,
            )

        elif body.template == EmailTemplate.rejection:
            message_id = email_service.send_rejection(
                candidate_email=body.to,
                candidate_name=candidate_name,
                job_title=job_title,
            )

        elif body.template == EmailTemplate.status_update:
            message_id = email_service.send_status_update(
                candidate_email=body.to,
                candidate_name=candidate_name,
                job_title=job_title,
                new_status=data["new_status"],
            )

        else:
            raise HTTPException(
                status_code=400,
                detail=_problem_response(
                    400,
                    "Invalid Template",
                    f"Unknown email template: {body.template}",
                ),
            )

    except KeyError as exc:
        raise HTTPException(
            status_code=422,
            detail=_problem_response(
                422,
                "Missing Field",
                f"Required field missing in data: {exc}",
            ),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception("Failed to send email")
        raise HTTPException(
            status_code=502,
            detail=_problem_response(
                502,
                "Email Delivery Failed",
                f"The email provider returned an error: {exc}",
            ),
        ) from exc

    return SendEmailResponse(message_id=message_id)


@router.post("/bulk-custom", response_model=BulkCustomEmailResponse)
async def send_bulk_custom_email(body: BulkCustomEmailRequest) -> BulkCustomEmailResponse:
    """Send recruiter-authored email content to multiple recipients."""
    import asyncio
    
    if not body.to:
        raise HTTPException(status_code=422, detail="Recipient list cannot be empty")
    if not body.subject.strip():
        raise HTTPException(status_code=422, detail="Subject is required")
    if not body.body.strip():
        raise HTTPException(status_code=422, detail="Body is required")

    sent_count = 0
    failed_count = 0
    first_error: str | None = None
    failed_recipients: list[str] = []

    for index, recipient in enumerate(body.to):
        try:
            logger.info("Sending bulk custom email to %s", recipient)
            email_service.send_custom_email(
                to_email=recipient,
                subject=body.subject.strip(),
                body_text=body.body.strip(),
                attachments=[
                    {
                        "filename": attachment.filename,
                        "content_type": attachment.content_type,
                        "content_base64": attachment.content_base64,
                    }
                    for attachment in body.attachments
                ],
            )
            sent_count += 1
            logger.info("Successfully sent bulk custom email to %s", recipient)
            
            # Add delay to respect Resend rate limit (2 requests/second)
            # Wait 0.6 seconds between emails to stay under the limit
            if index < len(body.to) - 1:  # Don't wait after the last email
                await asyncio.sleep(0.6)
        except Exception as exc:
            logger.exception("Failed sending bulk custom email to %s", recipient)
            failed_count += 1
            failed_recipients.append(recipient)
            if first_error is None:
                first_error = str(exc)

    if sent_count == 0:
        raise HTTPException(
            status_code=502,
            detail=_problem_response(
                502,
                "Email Delivery Failed",
                first_error or "No emails could be delivered.",
            ),
        )

    if failed_count > 0:
        logger.warning(
            "Bulk email partially failed: sent=%d, failed=%d, failed_recipients=%s",
            sent_count,
            failed_count,
            failed_recipients,
        )

    return BulkCustomEmailResponse(sent_count=sent_count, failed_count=failed_count)
