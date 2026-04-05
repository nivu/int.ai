"""Applications API router — public application submission endpoint."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/applications", tags=["applications"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class SubmitApplicationRequest(BaseModel):
    hiring_post_id: str
    full_name: str
    email: EmailStr
    phone: str | None = None
    current_role: str | None = None
    current_company: str | None = None
    years_experience: int | None = None
    location: str | None = None
    photo_url: str | None = None
    resume_url: str
    resume_filename: str = "resume"


class SubmitApplicationResponse(BaseModel):
    application_id: str
    candidate_id: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/submit", response_model=SubmitApplicationResponse, status_code=201)
async def submit_application(body: SubmitApplicationRequest) -> SubmitApplicationResponse:
    """Accept a public application submission.

    Uses the service-role Supabase client to bypass RLS so that
    unauthenticated candidates can apply without auth tokens.
    """
    from app.services.supabase import supabase as sb

    # 1. Upsert candidate by email
    try:
        candidate_payload: dict[str, Any] = {
            "email": body.email.lower(),
            "full_name": body.full_name.strip(),
        }
        if body.phone:
            candidate_payload["phone"] = body.phone.strip()
        if body.current_role:
            candidate_payload["current_role"] = body.current_role.strip()
        if body.current_company:
            candidate_payload["current_company"] = body.current_company.strip()
        if body.years_experience is not None:
            candidate_payload["years_experience"] = body.years_experience
        if body.location:
            candidate_payload["location"] = body.location.strip()
        if body.photo_url:
            candidate_payload["photo_url"] = body.photo_url

        candidate_resp = (
            sb.table("candidates")
            .upsert(candidate_payload, on_conflict="email")
            .execute()
        )
        candidate = candidate_resp.data[0]
        candidate_id: str = candidate["id"]
    except Exception as exc:
        logger.exception("Failed to upsert candidate")
        raise HTTPException(status_code=500, detail=f"Failed to save candidate: {exc}") from exc

    # 2. Check for duplicate application
    try:
        dup_resp = (
            sb.table("applications")
            .select("id")
            .eq("hiring_post_id", body.hiring_post_id)
            .eq("candidate_id", candidate_id)
            .execute()
        )
        if dup_resp.data and len(dup_resp.data) > 0:
            raise HTTPException(
                status_code=409,
                detail="You have already applied to this position.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to check for duplicate application")
        raise HTTPException(status_code=500, detail=f"Duplicate check failed: {exc}") from exc

    # 3. Insert application
    try:
        app_resp = (
            sb.table("applications")
            .insert(
                {
                    "hiring_post_id": body.hiring_post_id,
                    "candidate_id": candidate_id,
                    "resume_url": body.resume_url,
                    "resume_filename": body.resume_filename,
                    "status": "applied",
                }
            )
            .execute()
        )
        application = app_resp.data[0]
        application_id: str = application["id"]
    except Exception as exc:
        logger.exception("Failed to create application")
        raise HTTPException(status_code=500, detail=f"Failed to create application: {exc}") from exc

    # 4. Trigger screening asynchronously (best-effort)
    try:
        from app.tasks.screen_resume import screen_resume_task

        screen_resume_task.delay(application_id, body.hiring_post_id)
        logger.info(
            "Dispatched screen_resume_task for application_id=%s", application_id
        )
    except ImportError:
        logger.warning(
            "screen_resume task module not available — skipping screening for application_id=%s",
            application_id,
        )
    except Exception:
        logger.exception(
            "Failed to dispatch screening task for application_id=%s", application_id
        )

    return SubmitApplicationResponse(
        application_id=application_id,
        candidate_id=candidate_id,
    )
