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


def _resolve_candidate_from_invite_token(sb, invite_token: str) -> str:
    """Validate an invite token and return the candidate_id."""
    session_result = (
        sb.table("interview_sessions")
        .select("id, status, application_id")
        .eq("invite_token", invite_token)
        .execute()
    )
    if not session_result.data:
        raise HTTPException(status_code=401, detail="Invalid invite link")
    session = session_result.data[0]
    if session["status"] in ("completed", *_TERMINATED_STATUSES):
        raise HTTPException(status_code=403, detail="Interview already completed. Retakes are not permitted.")
    app_result = (
        sb.table("applications")
        .select("candidate_id")
        .eq("id", session["application_id"])
        .execute()
    )
    if not app_result.data:
        raise HTTPException(status_code=404, detail="Application not found")
    return app_result.data[0]["candidate_id"]


def _resolve_candidate(sb, token: str) -> tuple[str, str]:
    """Verify JWT, return (user_id, candidate_id). Links auth_user_id if missing."""
    try:
        user_resp = sb.auth.get_user(token)
        user = user_resp.user
        user_email: str = user.email.lower()
        user_id: str = str(user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    cand_resp = sb.table("candidates").select("id, auth_user_id").eq("email", user_email).execute()
    if not cand_resp.data:
        raise HTTPException(status_code=404, detail="No candidate record found for this account")

    cand = cand_resp.data[0]
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
    authorization: str = Header(default=""),
    x_invite_token: str = Header(default=""),
) -> PendingSessionResponse:
    """Return the candidate's pending interview session, creating it if missing.

    Uses the service-role client throughout so RLS is never a blocker.
    Also resets stuck sessions (completed with 0 questions) so candidates
    can retry after a disconnect.
    """
    from datetime import timedelta, timezone
    from datetime import datetime as dt

    from app.services.supabase import supabase as sb

    if x_invite_token:
        candidate_id = _resolve_candidate_from_invite_token(sb, x_invite_token)
    elif authorization:
        token = authorization.removeprefix("Bearer ").strip()
        _, candidate_id = _resolve_candidate(sb, token)
    else:
        raise HTTPException(status_code=401, detail="Authentication required")

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


@router.post("/end-session", status_code=200)
async def end_session_route(session_id: str = Body(..., embed=True)) -> dict:
    """Mark an in-progress session as completed and enqueue evaluation.

    Called by the candidate's 'End Interview' button. Idempotent — if the
    session is already completed or terminated, it is left untouched.
    """
    from app.services.supabase import supabase as sb
    try:
        row = (
            sb.table("interview_sessions")
            .select("status")
            .eq("id", session_id)
            .execute()
        )
        if not row or not row.data:
            raise HTTPException(status_code=404, detail="Session not found")
        current_status = row.data[0]["status"]
        if current_status not in ("in_progress", "pending"):
            # Already completed/terminated — nothing to do
            return {"status": "ok", "session_status": current_status}
        await end_session(session_id)
        return {"status": "ok", "session_status": "completed"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to end session %s", session_id)
        raise HTTPException(status_code=500, detail="Failed to end session")


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


@router.get("/{session_id}/summary")
async def get_interview_summary(session_id: str) -> dict:
    """Generate an on-demand AI summary of a completed interview session.

    Spec: GET /api/v1/interview/{session_id}/summary
    Returns 404 if session not found, 400 if transcript unavailable, 500 if LLM fails.
    """
    from datetime import datetime, timezone
    from openai import OpenAI
    from app.services.supabase import supabase as sb

    # Fetch session
    session_resp = (
        sb.table("interview_sessions")
        .select("id, status, application_id")
        .eq("id", session_id)
        .maybe_single()
        .execute()
    )
    if not session_resp.data:
        raise HTTPException(status_code=404, detail="Interview session not found")
    session = session_resp.data

    completed_statuses = {"completed", "terminated_tab_switch", "terminated_abandoned"}
    if session["status"] not in completed_statuses:
        raise HTTPException(status_code=400, detail="Interview not completed - transcript not available")

    # Fetch Q&A items
    qa_resp = (
        sb.table("interview_qa")
        .select("question_number, question_text, answer_text")
        .eq("session_id", session_id)
        .order("question_number")
        .execute()
    )
    qa_items = qa_resp.data or []
    if not qa_items:
        raise HTTPException(status_code=400, detail="Interview not completed - transcript not available")

    # Fetch job title and candidate name for richer prompt context
    job_title = "the role"
    candidate_name = "the candidate"
    app_resp = (
        sb.table("applications")
        .select("hiring_post_id, candidate_id")
        .eq("id", session["application_id"])
        .maybe_single()
        .execute()
    )
    if app_resp.data:
        post_resp = (
            sb.table("hiring_posts")
            .select("title")
            .eq("id", app_resp.data["hiring_post_id"])
            .maybe_single()
            .execute()
        )
        if post_resp.data:
            job_title = post_resp.data["title"]

        cand_resp = (
            sb.table("candidates")
            .select("full_name")
            .eq("id", app_resp.data["candidate_id"])
            .maybe_single()
            .execute()
        )
        if cand_resp.data and cand_resp.data.get("full_name"):
            candidate_name = cand_resp.data["full_name"]

    # Build transcript text
    transcript_lines: list[str] = []
    for qa in qa_items:
        q_num = qa.get("question_number", "?")
        q_text = (qa.get("question_text") or "").strip()
        a_text = (qa.get("answer_text") or "").strip() or "(No response)"
        transcript_lines.append(f"Q{q_num}: {q_text}\nCandidate: {a_text}")
    full_transcript = "\n\n".join(transcript_lines)

    # Truncate if very long — keep full Q&A pairs up to ~8000 chars
    if len(full_transcript) > 8000:
        truncated_lines: list[str] = []
        total = 0
        for line in transcript_lines:
            if total + len(line) > 8000:
                break
            truncated_lines.append(line)
            total += len(line)
        full_transcript = "\n\n".join(truncated_lines)
        full_transcript += f"\n\n(Summary based on first {len(truncated_lines)} questions due to length)"

    # Spec-defined prompts (verbatim from spec)
    system_prompt = (
        "You are an expert technical recruiter analyzing interview transcripts. "
        "Your task is to provide a comprehensive, objective summary of the candidate's interview performance. "
        "Focus on technical accuracy, communication clarity, problem-solving ability, and cultural fit indicators.\n\n"
        "Be honest and balanced in your assessment. Highlight both strengths and weaknesses. "
        "Your summary will help recruiters make informed decisions about advancing candidates."
    )
    user_prompt = (
        f"Analyze the following interview transcript and provide a comprehensive summary.\n\n"
        f"Job Title: {job_title}\n"
        f"Candidate Name: {candidate_name}\n\n"
        f"Interview Transcript:\n{full_transcript}\n\n"
        "Provide a structured summary with the following sections:\n\n"
        "1. Overall Performance: A 2-3 sentence high-level assessment\n"
        "2. Key Strengths: 3-5 bullet points of demonstrated strengths\n"
        "3. Areas of Concern: 2-4 bullet points of weaknesses or gaps\n"
        "4. Notable Responses: 2-3 bullet points of standout moments\n"
        "5. Overall Recommendation: Clear sentiment "
        "(Strong Recommend / Recommend with Reservations / Do Not Recommend) with brief justification\n\n"
        "Format your response in markdown with clear section headers."
    )

    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=1000,
            timeout=30.0,
        )
        summary_text = (response.choices[0].message.content or "").strip()
    except Exception:
        logger.exception("Failed to generate interview summary for session %s", session_id)
        raise HTTPException(status_code=500, detail="Failed to generate summary")

    return {
        "session_id": session_id,
        "summary": summary_text,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_used": "gpt-4o-mini",
    }


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
