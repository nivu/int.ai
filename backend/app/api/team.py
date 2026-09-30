"""Team API — list and invite team members.

``team_members`` holds only ``user_id``/``role``/``status``; the email lives in
Supabase Auth, which the browser cannot read. These endpoints resolve it with
the service-role client so Settings → Team can render.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr

from app.api.auth import _resolve_admin_member
from app.config import settings
from app.services import email as email_service
from app.services.supabase import supabase

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/team", tags=["team"])

ROLES = ("admin", "recruiter", "hiring_manager")


class TeamMemberOut(BaseModel):
    id: str
    email: str | None
    role: str
    status: str
    created_at: str


class ListTeamResponse(BaseModel):
    items: list[TeamMemberOut]


class InviteRequest(BaseModel):
    email: EmailStr
    role: str


class InviteResponse(BaseModel):
    member: TeamMemberOut
    email_sent: bool


def _auth_users_by_id() -> dict[str, str]:
    return {str(u.id): (u.email or "") for u in supabase.auth.admin.list_users()}


def list_team_members(org_id: str) -> list[dict[str, Any]]:
    rows = (
        supabase.table("team_members")
        .select("id, user_id, role, status, created_at")
        .eq("org_id", org_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    emails = _auth_users_by_id() if rows else {}
    return [
        {
            "id": r["id"],
            "email": emails.get(r["user_id"]) or None,
            "role": r["role"],
            "status": r["status"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def _find_or_create_auth_user(email: str) -> str:
    """Return the auth user id for ``email``, creating a confirmed user if needed.

    New users have no password; they sign in with the email code (OTP) option
    on the login page.
    """
    for u in supabase.auth.admin.list_users():
        if (u.email or "").lower() == email:
            return str(u.id)
    created = supabase.auth.admin.create_user({"email": email, "email_confirm": True})
    return str(created.user.id)


@router.get("", response_model=ListTeamResponse)
async def list_team(authorization: str = Header(...)) -> ListTeamResponse:
    member = _resolve_admin_member(authorization)
    return ListTeamResponse(items=[TeamMemberOut(**m) for m in list_team_members(member["org_id"])])


@router.post("/invite", response_model=InviteResponse, status_code=201)
async def invite_member(body: InviteRequest, authorization: str = Header(...)) -> InviteResponse:
    inviter = _resolve_admin_member(authorization)
    if inviter["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can invite team members")
    if body.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {', '.join(ROLES)}")

    email = body.email.lower()
    try:
        user_id = _find_or_create_auth_user(email)
    except Exception as exc:
        logger.exception("Failed to resolve auth user for invite %s", email)
        raise HTTPException(status_code=502, detail="Could not create the user account") from exc

    existing = (
        supabase.table("team_members")
        .select("id")
        .eq("org_id", inviter["org_id"])
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    if existing:
        raise HTTPException(status_code=409, detail="This person is already a member of your organisation")

    row = (
        supabase.table("team_members")
        .insert(
            {
                "org_id": inviter["org_id"],
                "user_id": user_id,
                "role": body.role,
                "status": "invited",
                "invited_by": inviter["id"],
            }
        )
        .execute()
        .data[0]
    )

    email_sent = True
    try:
        email_service.send_team_invitation(
            to_email=email,
            role=body.role,
            login_url=f"{settings.FRONTEND_URL.rstrip('/')}/auth/login",
        )
    except Exception:
        logger.exception("Team invitation email failed for %s", email)
        email_sent = False

    logger.info("Team member invited id=%s org=%s by=%s", row["id"], inviter["org_id"], inviter["id"])
    return InviteResponse(
        member=TeamMemberOut(id=row["id"], email=email, role=row["role"], status=row["status"], created_at=row["created_at"]),
        email_sent=email_sent,
    )
