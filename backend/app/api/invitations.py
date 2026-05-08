"""Invitations API router — send team member invitation emails."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app.config import settings
from app.services import email as email_service

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/invitations", tags=["invitations"])


class SendInvitationRequest(BaseModel):
    email: EmailStr
    role: str


class SendInvitationResponse(BaseModel):
    message_id: str
    status: str = "sent"


@router.post("/send", response_model=SendInvitationResponse)
async def send_invitation(body: SendInvitationRequest) -> SendInvitationResponse:
    """Send an invitation email to a new team member."""
    try:
        message_id = email_service.send_team_invitation(
            to_email=body.email,
            role=body.role,
            login_url=f"{settings.FRONTEND_URL.rstrip('/')}/auth/login",
        )
        return SendInvitationResponse(message_id=message_id)
    except Exception as exc:
        logger.exception("Failed to send invitation email to %s", body.email)
        raise HTTPException(status_code=502, detail="Failed to send invitation email") from exc
