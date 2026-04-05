"""LiveKit agent entrypoint for AI voice interviews.

Run as:
    python -m app.interview.entrypoint
    livekit-agents start app.interview.entrypoint
"""

from __future__ import annotations

import logging

from livekit.agents import (
    AgentSession,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)

from app.config import settings
from app.interview.agent import create_interview_agent
from app.services.supabase import get_record

logger = logging.getLogger("int.ai")


# ---------------------------------------------------------------------------
# Prewarm — called once when a worker process starts
# ---------------------------------------------------------------------------

def prewarm(proc: JobProcess) -> None:
    """Import heavy modules eagerly so the first job starts faster."""
    # Pre-import plugins so their native libs are loaded before any room join.
    import livekit.plugins.deepgram  # noqa: F401
    import livekit.plugins.openai  # noqa: F401

    logger.info("Agent process prewarmed (pid=%s)", proc)


# ---------------------------------------------------------------------------
# Entrypoint — called for each room/job the agent is dispatched to
# ---------------------------------------------------------------------------

async def entrypoint(ctx: JobContext) -> None:
    """Main entrypoint invoked when the agent joins a LiveKit room.

    The room name is expected to follow the format ``interview-{session_id}``.
    Session context (resume, JD, template config) is fetched from Supabase
    and used to configure the voice interview agent.
    """
    await ctx.connect()

    room_name: str = ctx.room.name
    logger.info("Agent joined room: %s", room_name)

    # ------------------------------------------------------------------
    # Extract session_id from room name (format: "interview-{session_id}")
    # ------------------------------------------------------------------
    if not room_name.startswith("interview-"):
        logger.error(
            "Room name %r does not match expected format 'interview-{session_id}'. "
            "Disconnecting.",
            room_name,
        )
        return

    session_id = room_name[len("interview-"):]

    # ------------------------------------------------------------------
    # Fetch session context from Supabase
    # ------------------------------------------------------------------
    try:
        session_record = get_record("interview_sessions", session_id)
    except Exception:
        logger.exception(
            "Failed to fetch session record for session_id=%s. Disconnecting.",
            session_id,
        )
        return

    application_id: str = session_record.get("application_id", "")
    template_id: str = session_record.get("template_id", "")

    # Fetch resume markdown from the application record
    try:
        application = get_record("applications", application_id)
        resume_markdown: str = application.get("resume_markdown", "")
    except Exception:
        logger.exception(
            "Failed to fetch application %s for session %s. Disconnecting.",
            application_id,
            session_id,
        )
        return

    # Fetch job description and template config
    try:
        template = get_record("interview_templates", template_id)
        jd_text: str = template.get("jd_text", "")
        template_config: dict = template.get("config", {})
    except Exception:
        logger.exception(
            "Failed to fetch template %s for session %s. Disconnecting.",
            template_id,
            session_id,
        )
        return

    if not resume_markdown:
        logger.warning("Resume markdown is empty for session %s", session_id)

    if not jd_text:
        logger.warning("Job description is empty for session %s", session_id)

    # ------------------------------------------------------------------
    # Create and start the interview agent
    # ------------------------------------------------------------------
    agent, session, controller = create_interview_agent(
        session_id=session_id,
        resume_markdown=resume_markdown,
        jd_text=jd_text,
        template_config=template_config,
    )

    logger.info(
        "Starting interview agent for session=%s (max_questions=%d, max_duration=%ds)",
        session_id,
        controller.max_questions,
        controller.max_duration_seconds,
    )

    await session.start(agent=agent, room=ctx.room)

    # Send initial greeting so the candidate doesn't have to speak first
    await session.say(
        "Hi there! Welcome to your interview for the position. "
        "I'm your AI interviewer today. Let's get started. "
        "Are you ready for the first question?",
        allow_interruptions=True,
    )


# ---------------------------------------------------------------------------
# Worker configuration
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            ws_url=settings.LIVEKIT_URL,
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_API_SECRET.get_secret_value(),
        )
    )
