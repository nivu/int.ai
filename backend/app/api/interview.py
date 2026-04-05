"""Interview API router — create rooms, reconnect, and trigger evaluation."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models.interview import (
    CreateRoomRequest,
    CreateRoomResponse,
    EvaluateRequest,
    EvaluateResponse,
    ReconnectRequest,
    ReconnectResponse,
)
from app.config import settings
from app.interview.session_manager import end_session, reconnect_session, start_session_from_existing
from app.worker import celery_app

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/interview", tags=["interview"])


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


@router.post("/evaluate", response_model=EvaluateResponse, status_code=202)
async def evaluate(body: EvaluateRequest) -> EvaluateResponse:
    """Enqueue an evaluation task for a completed interview session."""
    try:
        result = celery_app.send_task(
            "app.tasks.evaluate_interview.evaluate_interview_task",
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
