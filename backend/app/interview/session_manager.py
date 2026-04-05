"""Interview session lifecycle management.

Handles creation, reconnection, and termination of LiveKit-backed interview
sessions, with all metadata persisted in Supabase.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from livekit.api import AccessToken, VideoGrants
from livekit.api import LiveKitAPI

from app.config import settings
from app.services.supabase import get_record, insert_record, update_record
from app.worker import celery_app

logger = logging.getLogger("int.ai")

# Token / room defaults
_TOKEN_TTL = timedelta(hours=2)
_RECONNECT_WINDOW = timedelta(minutes=5)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_candidate_token(room_name: str, identity: str, ttl: timedelta = _TOKEN_TTL) -> tuple[str, datetime]:
    """Create a LiveKit access token for the candidate.

    Returns ``(token_jwt, expires_at)``.
    """
    expires_at = datetime.now(timezone.utc) + ttl

    token = AccessToken(
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET.get_secret_value(),
    )
    token.identity = identity
    token.ttl = ttl
    token.add_grant(
        VideoGrants(
            room_join=True,
            room=room_name,
        )
    )

    return token.to_jwt(), expires_at


async def _create_livekit_room(room_name: str) -> None:
    """Create a LiveKit room via the server API."""
    api = LiveKitAPI(
        url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET.get_secret_value(),
    )
    try:
        await api.room.create_room(
            name=room_name,
            empty_timeout=300,      # auto-close after 5 min if empty
            max_participants=2,     # candidate + AI agent
        )
        logger.info("LiveKit room created: %s", room_name)
    finally:
        await api.aclose()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def start_session(application_id: str, template_id: str) -> dict[str, Any]:
    """Create a new interview session.

    1. Inserts a session record in Supabase.
    2. Creates a LiveKit room.
    3. Generates a candidate access token.

    Returns
    -------
    dict
        ``{session_id, room_name, candidate_token, expires_at,
          reconnection_token}``
    """
    reconnection_token = secrets.token_urlsafe(32)
    room_name = f"interview-{secrets.token_hex(8)}"

    # Persist session in Supabase
    record = insert_record(
        "interview_sessions",
        {
            "application_id": application_id,
            "template_id": template_id,
            "room_name": room_name,
            "status": "created",
            "reconnection_token": reconnection_token,
            "reconnection_expires_at": (
                datetime.now(timezone.utc) + _RECONNECT_WINDOW
            ).isoformat(),
        },
    )
    session_id: str = record["id"]

    # Create the LiveKit room
    await _create_livekit_room(room_name)

    # Generate candidate token
    identity = f"candidate-{session_id}"
    candidate_token, expires_at = _generate_candidate_token(room_name, identity)

    logger.info(
        "Interview session started: session_id=%s room=%s",
        session_id,
        room_name,
    )

    return {
        "session_id": session_id,
        "room_name": room_name,
        "candidate_token": candidate_token,
        "expires_at": expires_at,
        "reconnection_token": reconnection_token,
    }


async def reconnect_session(session_id: str, reconnection_token: str) -> dict[str, Any]:
    """Validate a reconnection token and issue a fresh candidate token.

    Returns
    -------
    dict
        ``{session_id, room_name, candidate_token, expires_at}``

    Raises
    ------
    ValueError
        If the reconnection token is invalid.
    PermissionError
        If the reconnection window has expired.
    """
    session = get_record("interview_sessions", session_id)

    # Validate token
    stored_token = session.get("reconnection_token")
    if not secrets.compare_digest(str(stored_token), reconnection_token):
        raise ValueError("Invalid reconnection token")

    # Validate expiry window
    expires_str = session.get("reconnection_expires_at", "")
    if expires_str:
        expires_at_dt = datetime.fromisoformat(expires_str)
        if datetime.now(timezone.utc) > expires_at_dt:
            raise PermissionError("Reconnection window has expired")

    room_name: str = session["room_name"]
    identity = f"candidate-{session_id}"
    candidate_token, expires_at = _generate_candidate_token(room_name, identity)

    # Refresh the reconnection window
    update_record(
        "interview_sessions",
        session_id,
        {
            "reconnection_expires_at": (
                datetime.now(timezone.utc) + _RECONNECT_WINDOW
            ).isoformat(),
        },
    )

    logger.info("Session reconnected: session_id=%s", session_id)

    return {
        "session_id": session_id,
        "room_name": room_name,
        "candidate_token": candidate_token,
        "expires_at": expires_at,
    }


async def end_session(session_id: str) -> None:
    """Mark a session as completed and trigger evaluation.

    Updates the session status, stores the duration, and enqueues the
    evaluation Celery task.
    """
    session = get_record("interview_sessions", session_id)

    created_at_str = session.get("created_at", "")
    duration_seconds = 0
    if created_at_str:
        created_at = datetime.fromisoformat(created_at_str)
        duration_seconds = int(
            (datetime.now(timezone.utc) - created_at).total_seconds()
        )

    update_record(
        "interview_sessions",
        session_id,
        {
            "status": "completed",
            "duration_seconds": duration_seconds,
        },
    )

    # Enqueue evaluation
    celery_app.send_task(
        "app.tasks.evaluate_interview.evaluate_interview_task",
        args=[session_id],
    )

    logger.info(
        "Session ended: session_id=%s duration=%ds", session_id, duration_seconds
    )
