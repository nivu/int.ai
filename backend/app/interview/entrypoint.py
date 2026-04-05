"""LiveKit agent entrypoint for AI voice interviews.

Run as:
    python -m app.interview.entrypoint
    livekit-agents start app.interview.entrypoint
"""

from __future__ import annotations

import asyncio
import json
import logging

from livekit.agents import (
    AgentSession,
    CloseEvent,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)

from app.config import settings
from app.interview.agent import create_interview_agent
from app.services.supabase import get_record, insert_record

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

    # Fetch application → resume_data (for resume) and hiring_post (for JD)
    resume_markdown = ""
    jd_text = ""
    try:
        application = get_record("applications", application_id)
        hiring_post_id = application.get("hiring_post_id", "")

        # Get resume markdown from resume_data table
        from app.services.supabase import supabase
        rd_response = supabase.table("resume_data").select("raw_markdown").eq(
            "application_id", application_id
        ).limit(1).execute()
        if rd_response.data:
            resume_markdown = rd_response.data[0].get("raw_markdown", "")

        # Get job description from hiring_posts
        if hiring_post_id:
            hiring_post = get_record("hiring_posts", hiring_post_id)
            jd_text = hiring_post.get("description", "")
    except Exception:
        logger.exception(
            "Failed to fetch application context for session %s.",
            session_id,
        )

    # Fetch template config
    template_config: dict = {}
    try:
        template = get_record("interview_templates", template_id)
        template_config = {
            "max_questions": template.get("max_questions", 10),
            "max_duration_seconds": template.get("max_duration_minutes", 45) * 60,
        }
    except Exception:
        logger.exception(
            "Failed to fetch template %s for session %s.",
            template_id,
            session_id,
        )

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

    # ------------------------------------------------------------------
    # Record Q&A pairs to interview_qa table for post-interview evaluation
    # ------------------------------------------------------------------
    last_agent_text: str = ""
    qa_number = 0

    @session.on("conversation_item_added")
    def _on_conversation_item(event: object) -> None:
        nonlocal last_agent_text, qa_number

        item = getattr(event, "item", None)
        if item is None:
            return

        msg = getattr(item, "message", item)
        role = getattr(msg, "role", None)
        content = getattr(msg, "content", None)

        if not role or not content:
            return

        # Handle content that might be a list
        if isinstance(content, list):
            content = " ".join(str(c) for c in content)
        content = str(content).strip()
        if not content:
            return

        if role == "assistant":
            last_agent_text = content
        elif role == "user" and last_agent_text:
            # User responded to an agent question — store the Q&A pair
            qa_number += 1
            try:
                insert_record("interview_qa", {
                    "session_id": session_id,
                    "question_number": qa_number,
                    "question_type": "foundational",
                    "question_text": last_agent_text,
                    "answer_text": content,
                })
                logger.info("Stored Q&A #%d for session=%s", qa_number, session_id)
            except Exception:
                logger.exception("Failed to store Q&A #%d for session=%s", qa_number, session_id)
            last_agent_text = ""

    # Track question count based on completed user speaking turns.
    # Each time the user finishes speaking = 1 answered question.
    question_count = 0

    async def _publish_data(data: bytes) -> None:
        """Publish data to room participants (awaits the coroutine)."""
        try:
            await ctx.room.local_participant.publish_data(data, reliable=True)
        except Exception:
            logger.debug("Failed to publish data message")

    @session.on("user_state_changed")
    def _on_user_state_changed(event: object) -> None:
        nonlocal question_count

        new_state = getattr(event, "new_state", None)
        old_state = getattr(event, "old_state", None)

        # User just finished speaking (was speaking → now listening)
        if old_state == "speaking" and new_state == "listening":
            question_count += 1

            # Send progress update to frontend via data channel
            msg = json.dumps({
                "type": "question_progress",
                "current": min(question_count, controller.max_questions),
            }).encode()
            asyncio.create_task(_publish_data(msg))

            logger.info(
                "Question %d/%d answered for session=%s",
                question_count, controller.max_questions, session_id,
            )

            # Check if we should end the session (let the agent respond
            # to the last answer before ending)
            if question_count >= controller.max_questions:
                async def _end_after_response() -> None:
                    # Wait for the agent to finish its response to the last answer
                    await asyncio.sleep(15)
                    if not controller.ended:
                        end_msg = json.dumps({"type": "session_end"}).encode()
                        await _publish_data(end_msg)
                        await session.say(
                            "That was the last question. Thank you for your time and "
                            "thoughtful responses. The interview is now complete.",
                            allow_interruptions=False,
                        )
                        controller.finish()
                        shutdown_event.set()
                asyncio.create_task(_end_after_response())

    # Send initial greeting so the candidate doesn't have to speak first
    await session.say(
        "Hi there! Welcome to your interview for the position. "
        "I'm your AI interviewer today. Let's get started. "
        "Are you ready for the first question?",
        allow_interruptions=True,
    )

    # Keep the entrypoint alive until the session closes
    shutdown_event = asyncio.Event()

    # Duration timeout — end interview after max_duration_seconds
    async def _duration_watchdog() -> None:
        await asyncio.sleep(controller.max_duration_seconds)
        if not controller.ended:
            logger.info("Interview duration limit reached for session=%s", session_id)
            end_msg = json.dumps({"type": "session_end"}).encode()
            await _publish_data(end_msg)
            await session.say(
                "We've reached the end of our time. Thank you for your responses. "
                "The interview is now complete.",
                allow_interruptions=False,
            )
            controller.finish()
            shutdown_event.set()

    asyncio.create_task(_duration_watchdog())

    @session.on("close")
    def _on_close(event: CloseEvent) -> None:
        controller.finish()
        shutdown_event.set()

    # Also handle room disconnect
    @ctx.room.on("disconnected")
    def _on_room_disconnect() -> None:
        controller.finish()
        shutdown_event.set()

    await shutdown_event.wait()


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
