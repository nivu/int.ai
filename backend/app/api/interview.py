"""Interview API router — create rooms, reconnect, and trigger evaluation."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Body, HTTPException, Header

from app.models.interview import (
    CreateRoomRequest,
    CreateRoomResponse,
    EvaluateRequest,
    EvaluateResponse,
    PendingSessionResponse,
    ReconnectRequest,
    ReconnectResponse,
)
from app.config import settings
from app.interview.session_manager import end_session, reconnect_session, start_session_from_existing
from app.worker import celery_app

_TERMINATED_STATUSES = frozenset({"terminated_tab_switch", "terminated_abandoned"})

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/interview", tags=["interview"])


def _resolve_candidate(sb, token: str) -> tuple[str, str]:
    """Verify JWT, return (user_id, candidate_id). Links auth_user_id if missing."""
    try:
        user_resp = sb.auth.get_user(token)
        user = user_resp.user
        user_email: str = user.email.lower()
        user_id: str = str(user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    cand_resp = sb.table("candidates").select("id, auth_user_id").eq("email", user_email).maybe_single().execute()
    if not cand_resp.data:
        raise HTTPException(status_code=404, detail="No candidate record found for this account")

    cand = cand_resp.data
    # Auto-link auth_user_id if not yet set
    if not cand.get("auth_user_id"):
        sb.table("candidates").update({"auth_user_id": user_id}).eq("id", cand["id"]).execute()
        logger.info("Linked auth_user_id for candidate=%s", cand["id"])

    return user_id, cand["id"]


@router.post("/link-candidate", status_code=200)
async def link_candidate(authorization: str = Header(...)) -> dict:
    """Link the Supabase auth user to their candidate record.

    Called from the candidate layout on every page load so RLS-gated
    queries (portal, interview page) always work regardless of sign-up order.
    """
    from app.services.supabase import supabase as sb

    token = authorization.removeprefix("Bearer ").strip()
    _resolve_candidate(sb, token)
    return {"status": "ok"}


@router.get("/my-session", response_model=PendingSessionResponse)
async def get_my_session(
    authorization: str = Header(...),
) -> PendingSessionResponse:
    """Return the candidate's pending interview session, creating it if missing.

    Uses the service-role client throughout so RLS is never a blocker.
    Also resets stuck sessions (completed with 0 questions) so candidates
    can retry after a disconnect.
    """
    from datetime import timedelta, timezone
    from datetime import datetime as dt

    from app.services.supabase import supabase as sb

    token = authorization.removeprefix("Bearer ").strip()
    _, candidate_id = _resolve_candidate(sb, token)

    # Find application in interview_sent/invited status only — no retakes allowed
    apps_resp = (
        sb.table("applications")
        .select("id, hiring_post_id, interview_deadline, status")
        .eq("candidate_id", candidate_id)
        .in_("status", ["interview_sent", "interview_invited"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not apps_resp.data:
        raise HTTPException(status_code=404, detail="No pending interview found")

    app_record = apps_resp.data[0]
    application_id: str = app_record["id"]
    hiring_post_id: str = app_record["hiring_post_id"]

    # Fetch hiring post and template
    post_rows = (
        sb.table("hiring_posts")
        .select("title, department, interview_template_id")
        .eq("id", hiring_post_id)
        .limit(1)
        .execute()
    ).data
    if not post_rows:
        raise HTTPException(status_code=404, detail="Hiring post not found")
    hiring_post = post_rows[0]
    template_id: str | None = hiring_post.get("interview_template_id")
    if not template_id:
        raise HTTPException(status_code=404, detail="No interview template configured for this position")

    template_rows = (
        sb.table("interview_templates")
        .select("max_duration_minutes, max_questions")
        .eq("id", template_id)
        .limit(1)
        .execute()
    ).data
    if not template_rows:
        raise HTTPException(status_code=404, detail="Interview template not found")
    template = template_rows[0]

    now = dt.now(timezone.utc)

    # Look for any existing session for this application
    all_sessions = (
        sb.table("interview_sessions")
        .select("id, status, deadline, consent_given_at, questions_asked")
        .eq("application_id", application_id)
        .order("created_at", desc=True)
        .execute()
    ).data

    session = None
    for s in all_sessions:
        if s["status"] == "pending" and s.get("deadline") and s["deadline"] > now.isoformat():
            # Valid pending session with time remaining
            session = s
            break
        if s["status"] == "in_progress" and (s.get("questions_asked") or 0) > 0:
            # Actively running interview — return it so the candidate can rejoin
            session = s
            break
        if (s.get("questions_asked") or 0) == 0 and s["status"] in ("pending", "in_progress", "disconnected"):
            # Stuck before the interview ever started (network/technical issue) — reset
            updated = sb.table("interview_sessions").update({
                "status": "pending",
                "started_at": None,
                "ended_at": None,
                "duration_seconds": None,
                "questions_asked": 0,
                "livekit_room_name": None,
                "consent_given_at": None,
                "reconnection_token": None,
                "reconnection_expires_at": None,
                "deadline": (now + timedelta(days=7)).isoformat(),
            }).eq("id", s["id"]).execute().data[0]
            session = updated
            logger.info("Reset stuck (pre-start) session=%s for application=%s", s["id"], application_id)
            break
        if s["status"] == "completed" or s["status"] in _TERMINATED_STATUSES:
            # Interview was completed or terminated — no retake regardless of questions answered
            raise HTTPException(status_code=403, detail="Interview already completed. Retakes are not permitted.")

    if not session:
        # No usable session — create one
        deadline = (app_record.get("interview_deadline") or (now + timedelta(days=7)).isoformat())
        try:
            session = (
                sb.table("interview_sessions")
                .insert({
                    "application_id": application_id,
                    "template_id": template_id,
                    "status": "pending",
                    "deadline": deadline,
                })
                .execute()
            ).data[0]
            logger.info("Created interview session for application=%s", application_id)
        except Exception:
            # Unique constraint: a session was created concurrently — fetch it
            existing = (
                sb.table("interview_sessions")
                .select("id, status, deadline, consent_given_at, questions_asked")
                .eq("application_id", application_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            ).data
            if not existing:
                logger.exception("Failed to create or fetch session for application=%s", application_id)
                raise HTTPException(status_code=500, detail="Could not create interview session")
            session = existing[0]

    return PendingSessionResponse(
        id=session["id"],
        status=session["status"],
        deadline=session["deadline"],
        consent_given_at=session.get("consent_given_at"),
        application={"id": application_id, "candidate_id": candidate_id, "hiring_post": hiring_post},
        template=template,
    )


@router.post("/create-room", response_model=CreateRoomResponse, status_code=201)
async def create_room(body: CreateRoomRequest) -> CreateRoomResponse:
    """Create a LiveKit room for an existing interview session."""
    try:
        result = await start_session_from_existing(body.session_id)
    except Exception:
        logger.exception("Failed to create interview room for session %s", body.session_id)
        raise HTTPException(status_code=500, detail="Failed to create interview room")

    return CreateRoomResponse(
        token=result["candidate_token"],
        server_url=settings.LIVEKIT_URL,
    )


@router.post("/reconnect", response_model=ReconnectResponse, status_code=200)
async def reconnect(body: ReconnectRequest) -> ReconnectResponse:
    """Reconnect to an existing interview session."""
    try:
        result = await reconnect_session(body.session_id, body.reconnection_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid reconnection token")
    except PermissionError:
        raise HTTPException(status_code=410, detail="Reconnection window has expired")
    except Exception:
        logger.exception("Failed to reconnect session %s", body.session_id)
        raise HTTPException(status_code=500, detail="Failed to reconnect session")

    return ReconnectResponse(
        session_id=result["session_id"],
        room_name=result["room_name"],
        candidate_token=result["candidate_token"],
        expires_at=result["expires_at"],
    )


@router.post("/terminate-abandoned", status_code=200)
async def terminate_abandoned(session_id: str = Body(..., embed=True)) -> dict:
    """Mark an in-progress session as terminated_abandoned.

    Called via navigator.sendBeacon on page unload while the session is
    in_progress.  Only transitions in_progress → terminated_abandoned;
    any other status is left untouched so we cannot accidentally overwrite
    a completed or already-terminated session.
    """
    from app.services.supabase import supabase as sb
    try:
        result = (
            sb.table("interview_sessions")
            .update({"status": "terminated_abandoned"})
            .eq("id", session_id)
            .eq("status", "in_progress")
            .execute()
        )
        updated = result.data or []
        if updated:
            logger.info("Session %s marked terminated_abandoned via beacon", session_id)
        else:
            logger.debug(
                "terminate-abandoned called for session %s but status was not in_progress",
                session_id,
            )
    except Exception:
        logger.exception("Failed to mark session %s as terminated_abandoned", session_id)
    return {"status": "ok"}


@router.post("/evaluate", response_model=EvaluateResponse, status_code=202)
async def evaluate(body: EvaluateRequest) -> EvaluateResponse:
    """Enqueue an evaluation task for a completed interview session."""
    try:
        result = celery_app.send_task(
            "evaluate_interview_task",
            args=[body.session_id],
        )
    except Exception:
        logger.exception("Failed to enqueue evaluation for session %s", body.session_id)
        raise HTTPException(status_code=500, detail="Failed to enqueue evaluation task")

    logger.info(
        "Evaluation task enqueued: task_id=%s session=%s",
        result.id,
        body.session_id,
    )
    return EvaluateResponse(task_id=result.id, status="queued")
