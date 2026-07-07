"""Reports API router — recruiter overrides on interview reports."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.api.auth import _resolve_admin_org
from app.services.supabase import get_record, supabase

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/reports", tags=["reports"])


class OverrideRequest(BaseModel):
    notes: str
    override_recommendation: str


@router.post("/{report_id}/override", status_code=200)
async def override_report(
    report_id: str,
    body: OverrideRequest,
    authorization: str = Header(...),
) -> dict[str, str]:
    """Save a recruiter manual override for an interview report.

    Stores recruiter_override and recruiter_notes on the linked application.
    """
    caller_org = _resolve_admin_org(authorization)

    try:
        report = get_record("interview_reports", report_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        session = get_record("interview_sessions", report["session_id"])
        application_id: str = session["application_id"]
    except Exception:
        raise HTTPException(status_code=404, detail="Associated session not found")

    # Verify the application belongs to the caller's org
    app = get_record("applications", application_id)
    post = get_record("hiring_posts", app["hiring_post_id"])
    if post["org_id"] != caller_org:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        supabase.table("applications").update({
            "recruiter_override": body.override_recommendation,
            "recruiter_notes": body.notes,
        }).eq("id", application_id).execute()
    except Exception as exc:
        logger.exception("Failed to save override for report %s", report_id)
        raise HTTPException(status_code=500, detail="Failed to save override") from exc

    return {"status": "ok"}
