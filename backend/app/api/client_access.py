"""Client job access — admins grant a client read-only access to one job by
email, and a granted client can email the job's staff a change request.

Eligibility is decided in the database by ``client_post_ids_for_user``
(migration 032); see specs/003-client-job-access/spec.md.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.api.auth import _resolve_admin_member, _resolve_client_user
from app.config import settings
from app.services import email as email_service
from app.services.supabase import supabase

logger = logging.getLogger("int.ai")

router = APIRouter(tags=["client-access"])

_GRANT_COLUMNS = "id, hiring_post_id, email, client_company, created_at, revoked_at"
_DUPLICATE_DETAIL = "This email already has access to this job"


class ClientGrantOut(BaseModel):
    id: str
    hiring_post_id: str
    email: str
    client_company: str | None = None
    created_at: str
    revoked_at: str | None = None


class InviteClientRequest(BaseModel):
    email: EmailStr
    client_company: str | None = Field(None, max_length=200)


class InviteClientResponse(BaseModel):
    grant: ClientGrantOut
    email_sent: bool


class ListClientGrantsResponse(BaseModel):
    items: list[ClientGrantOut]


class ChangeRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

    @field_validator("message", mode="before")
    @classmethod
    def _strip_message(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


def _admin_post(authorization: str, job_id: str) -> tuple[dict, dict]:
    """Return ``(member, post)`` for an active admin of the job's org."""
    member = _resolve_admin_member(authorization)
    if member.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage client access")

    rows = (
        supabase.table("hiring_posts")
        .select("id,title,org_id,created_by")
        .eq("id", job_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Job not found")
    if rows[0].get("org_id") != member["org_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return member, rows[0]


def _prepare_client_account(email: str) -> None:
    """Make sure ``email`` has a confirmed auth account marked as a client.

    Creates it with the server-only ``int_ai_client`` app_metadata marker (set
    to the invited email, binding it to that address); an
    existing account is fine. Then ``prepare_client_account`` (migration 032)
    marks a pre-existing account, replaces its password and ends its sessions.
    Never calls ``list_users()``.
    """
    try:
        supabase.auth.admin.create_user(
            {"email": email, "email_confirm": True, "app_metadata": {"int_ai_client": email}}
        )
    except Exception as exc:
        if not (
            getattr(exc, "code", None) == "email_exists" or "already been registered" in str(exc)
        ):
            logger.exception("Failed to create auth user for client %s", email)
            raise HTTPException(status_code=502, detail="Failed to prepare client account") from exc

    try:
        result = supabase.rpc("prepare_client_account", {"p_email": email}).execute().data
    except Exception as exc:
        logger.exception("Failed to prepare client account %s", email)
        raise HTTPException(status_code=502, detail="Failed to prepare client account") from exc

    if result == "staff":
        logger.warning("Client access granted to staff account %s; the grant is inert", email)
    elif result not in ("ready", "prepared"):
        logger.error("prepare_client_account returned %r for %s", result, email)
        raise HTTPException(status_code=502, detail="Failed to prepare client account")


def list_grants(job_id: str) -> list[dict]:
    """Active grants on ``job_id``, newest first. Caller has checked admin access."""
    return (
        supabase.table("job_client_access")
        .select(_GRANT_COLUMNS)
        .eq("hiring_post_id", job_id)
        .is_("revoked_at", "null")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def grant_access(
    job_id: str, job_title: str, email: str, client_company: str | None, member_id: str
) -> tuple[dict, bool]:
    """Grant ``email`` access to ``job_id`` and send the invite.

    Caller has checked admin access. Returns ``(grant_row, email_sent)``.
    Shared by the HTTP endpoint and the MCP tool.
    """
    email = email.lower().strip()

    existing = (
        supabase.table("job_client_access")
        .select("id")
        .eq("hiring_post_id", job_id)
        .eq("email", email)
        .is_("revoked_at", "null")
        .limit(1)
        .execute()
        .data
    )
    if existing:
        raise HTTPException(status_code=409, detail=_DUPLICATE_DETAIL)

    _prepare_client_account(email)

    try:
        row = (
            supabase.table("job_client_access")
            .insert(
                {
                    "hiring_post_id": job_id,
                    "email": email,
                    "client_company": (client_company or "").strip() or None,
                    "invited_by": member_id,
                }
            )
            .execute()
            .data[0]
        )
    except Exception as exc:
        if getattr(exc, "code", None) == "23505" or "job_client_access_active_uq" in str(exc):
            raise HTTPException(status_code=409, detail=_DUPLICATE_DETAIL) from exc
        logger.exception("Failed to create client access for job %s", job_id)
        raise HTTPException(status_code=500, detail="Failed to create client access") from exc

    email_sent = True
    try:
        email_service.send_client_job_invitation(
            email,
            job_title,
            login_url=f"{settings.FRONTEND_URL.rstrip('/')}/auth/login?type=client",
        )
    except Exception:
        logger.exception("Client invitation email failed for %s", email)
        email_sent = False

    logger.info("Client access granted id=%s job=%s by=%s", row["id"], job_id, member_id)
    return row, email_sent


def revoke_grant(job_id: str, grant_id: str, member_id: str) -> None:
    """Revoke grant ``grant_id`` on ``job_id``. Caller has checked admin access."""
    rows = (
        supabase.table("job_client_access")
        .select("id, revoked_at")
        .eq("id", grant_id)
        .eq("hiring_post_id", job_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Client access not found")
    if rows[0].get("revoked_at"):
        return
    supabase.table("job_client_access").update({"revoked_at": datetime.now(UTC).isoformat()}).eq(
        "id", grant_id
    ).execute()
    logger.info("Client access revoked id=%s job=%s by=%s", grant_id, job_id, member_id)


@router.get("/jobs/{job_id}/client-access", response_model=ListClientGrantsResponse)
async def list_client_access(
    job_id: UUID, authorization: str = Header(...)
) -> ListClientGrantsResponse:
    job_id = str(job_id)
    _admin_post(authorization, job_id)
    return ListClientGrantsResponse(items=[ClientGrantOut(**r) for r in list_grants(job_id)])


@router.post("/jobs/{job_id}/client-access", response_model=InviteClientResponse, status_code=201)
async def invite_client(
    job_id: UUID,
    body: InviteClientRequest,
    authorization: str = Header(...),
) -> InviteClientResponse:
    job_id = str(job_id)
    member, post = _admin_post(authorization, job_id)
    row, email_sent = grant_access(
        job_id, str(post.get("title", "")), body.email, body.client_company, member["id"]
    )
    return InviteClientResponse(
        grant=ClientGrantOut(**{k: row.get(k) for k in ClientGrantOut.model_fields}),
        email_sent=email_sent,
    )


@router.delete("/jobs/{job_id}/client-access/{grant_id}")
async def revoke_client_access(
    job_id: UUID, grant_id: UUID, authorization: str = Header(...)
) -> dict:
    job_id, grant_id = str(job_id), str(grant_id)
    member, _ = _admin_post(authorization, job_id)
    revoke_grant(job_id, grant_id, member["id"])
    return {"status": "ok"}


@router.post("/client/jobs/{job_id}/change-request")
async def client_change_request(
    job_id: str,
    body: ChangeRequest,
    authorization: str = Header(...),
) -> dict:
    client = _resolve_client_user(authorization)
    data = (
        supabase.rpc("client_post_ids_for_user", {"p_user_id": client["user_id"]}).execute().data
        or []
    )
    post_ids = {str(next(iter(r.values()))) if isinstance(r, dict) else str(r) for r in data}
    if job_id not in post_ids:
        raise HTTPException(status_code=403, detail="No access to this job")

    post = (
        supabase.table("hiring_posts")
        .select("title, org_id, created_by")
        .eq("id", job_id)
        .limit(1)
        .execute()
        .data
    )[0]

    user_ids: list[str] = []
    if post.get("created_by"):
        creator = (
            supabase.table("team_members")
            .select("user_id")
            .eq("id", post["created_by"])
            .execute()
            .data
            or []
        )
        user_ids += [r["user_id"] for r in creator]
    admins = (
        supabase.table("team_members")
        .select("user_id")
        .eq("org_id", post["org_id"])
        .eq("role", "admin")
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    user_ids += [r["user_id"] for r in admins]

    to_emails: list[str] = []
    for uid in dict.fromkeys(str(u) for u in user_ids if u):
        try:
            addr = (supabase.auth.admin.get_user_by_id(uid).user.email or "").lower()
        except Exception:
            logger.exception("Change request recipient lookup failed for user %s", uid)
            continue
        if addr and addr not in to_emails:
            to_emails.append(addr)
    if not to_emails:
        raise HTTPException(status_code=502, detail="No recipient available")

    grant = (
        supabase.table("job_client_access")
        .select("client_company")
        .eq("hiring_post_id", job_id)
        .eq("email", client["email"])
        .is_("revoked_at", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    company = grant[0].get("client_company") if grant else None

    try:
        email_service.send_client_change_request(
            to_emails, str(post.get("title", "")), client["email"], company, body.message
        )
    except Exception as exc:
        logger.exception("Client change request email failed for job %s", job_id)
        raise HTTPException(status_code=502, detail="Failed to send request") from exc

    return {"status": "ok"}
