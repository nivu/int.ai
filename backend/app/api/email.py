"""Email API router — send transactional emails via templates."""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app.services import email as email_service

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/email", tags=["email"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class EmailTemplate(str, Enum):
    application_confirmation = "application_confirmation"
    interview_invitation = "interview_invitation"
    status_update = "status_update"


class SendEmailRequest(BaseModel):
    template: EmailTemplate
    to: EmailStr
    data: dict[str, Any]


class SendEmailResponse(BaseModel):
    message_id: str
    status: str = "sent"


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
            message_id = email_service.send_interview_invitation(
                candidate_email=body.to,
                candidate_name=candidate_name,
                job_title=job_title,
                interview_deadline=data["interview_deadline"],
                portal_url=data["portal_url"],
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
