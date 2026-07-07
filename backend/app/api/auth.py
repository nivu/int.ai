"""Shared auth helpers for admin API routes — extracts caller identity
and verifies org membership so service-role endpoints don't bypass
org isolation."""

from __future__ import annotations

import logging

from fastapi import Header, HTTPException

logger = logging.getLogger("int.ai")


def _resolve_admin_org(authorization: str = Header(...)) -> str:
    """Validate the caller's JWT, look up their team_members record,
    and return their org_id.

    Raises 401 if the token is missing/invalid and 403 if the caller
    is not an active team member.
    """
    from app.services.supabase import supabase as sb

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token")

    try:
        user_resp = sb.auth.get_user(token)
        user_id = str(user_resp.user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    member_resp = (
        sb.table("team_members")
        .select("org_id, role, status")
        .eq("user_id", user_id)
        .in_("role", ["admin", "recruiter", "hiring_manager"])
        .maybe_single()
        .execute()
    )
    if not member_resp.data:
        raise HTTPException(status_code=403, detail="Not a team member")

    member = member_resp.data
    if member.get("status") != "active":
        raise HTTPException(status_code=403, detail="Team member is not active")

    return member["org_id"]
