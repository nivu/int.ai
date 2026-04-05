"""LiveKit Agent factory for AI voice interviews.

Creates a fully configured Agent + AgentSession that conducts technical
interviews using Deepgram STT/TTS and OpenAI GPT-4o mini as the backing LLM.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from livekit.agents import Agent, AgentSession, ChatContext
from livekit.plugins import deepgram, openai

from app.config import settings
from app.interview.question_gen import QuestionGenerator
from app.services.supabase import insert_record, update_record
from app.worker import celery_app

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# System prompt for the AI interviewer persona
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """\
You are a professional yet warm AI technical interviewer for int.ai.

Guidelines:
- Greet the candidate briefly at the start and make them feel comfortable.
- After each answer, acknowledge what the candidate said before transitioning
  to the next question (e.g. "That's a great point about X. Let's move on to...").
- Keep transitions natural and conversational; never sound robotic.
- Ask one question at a time and wait for the candidate to finish.
- If the candidate's answer is vague or incomplete, politely probe deeper
  before moving to a new topic.
- When wrapping up, thank the candidate and let them know the next steps.

You will receive the next question to ask from the question generator.  Deliver
it naturally, as if you came up with it yourself.
"""


# ---------------------------------------------------------------------------
# Session-aware callback wrapper
# ---------------------------------------------------------------------------
class _SessionController:
    """Tracks question count and elapsed time for session boundary enforcement."""

    def __init__(
        self,
        session_id: str,
        resume_markdown: str,
        jd_text: str,
        max_questions: int,
        max_duration_seconds: int,
    ) -> None:
        self.session_id = session_id
        self.question_count = 0
        self.max_questions = max_questions
        self.max_duration_seconds = max_duration_seconds
        self.start_time = time.time()
        self.ended = False

        self.question_gen = QuestionGenerator(
            resume_markdown=resume_markdown,
            jd_text=jd_text,
        )

    @property
    def elapsed_seconds(self) -> float:
        return time.time() - self.start_time

    @property
    def should_wrap_up(self) -> bool:
        return (
            self.question_count >= self.max_questions
            or self.elapsed_seconds >= self.max_duration_seconds
        )

    def record_exchange(self, question_text: str, answer_text: str, topic: str) -> None:
        """Append a completed Q&A exchange to the conversation history."""
        self.question_gen.conversation_history.append(
            {"question": question_text, "answer": answer_text, "topic": topic}
        )
        self.question_count += 1

    def finish(self) -> None:
        """Persist session metadata and trigger the evaluation task."""
        if self.ended:
            return
        self.ended = True

        duration = int(self.elapsed_seconds)
        try:
            update_record(
                "interview_sessions",
                self.session_id,
                {
                    "status": "completed",
                    "duration_seconds": duration,
                    "questions_asked": self.question_count,
                    "ended_at": __import__("datetime").datetime.now(
                        __import__("datetime").timezone.utc
                    ).isoformat(),
                },
            )
        except Exception:
            logger.exception(
                "Failed to update session %s on completion", self.session_id
            )

        try:
            celery_app.send_task(
                "app.tasks.evaluate_interview.evaluate_interview_task",
                args=[self.session_id],
            )
            logger.info(
                "Evaluation task enqueued for session %s", self.session_id
            )
        except Exception:
            logger.exception(
                "Failed to enqueue evaluation task for session %s", self.session_id
            )


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def create_interview_agent(
    session_id: str,
    resume_markdown: str,
    jd_text: str,
    template_config: dict[str, Any],
) -> tuple[Agent, AgentSession, _SessionController]:
    """Build and return a configured :class:`Agent` and :class:`AgentSession`.

    Parameters
    ----------
    session_id:
        Unique identifier for this interview session.
    resume_markdown:
        Candidate resume in Markdown format.
    jd_text:
        Full job-description text.
    template_config:
        Template settings dict — expected keys include ``max_questions``
        (default 10) and ``max_duration_seconds`` (default 1800).

    Returns
    -------
    tuple[Agent, AgentSession, _SessionController]
        The agent, session, and controller — ready to start.
    """
    max_questions: int = template_config.get("max_questions", 10)
    max_duration: int = template_config.get("max_duration_seconds", 1800)

    controller = _SessionController(
        session_id=session_id,
        resume_markdown=resume_markdown,
        jd_text=jd_text,
        max_questions=max_questions,
        max_duration_seconds=max_duration,
    )

    # -- STT: Deepgram Nova-2, Indian English, streaming ---------------
    stt_plugin = deepgram.STT(
        model="nova-2",
        language="en-IN",
        api_key=settings.DEEPGRAM_API_KEY.get_secret_value(),
    )

    # -- TTS: Deepgram, streaming --------------------------------------
    tts_plugin = deepgram.TTS(
        api_key=settings.DEEPGRAM_API_KEY.get_secret_value(),
    )

    # -- LLM: OpenAI GPT-4o mini --------------------------------------
    llm_plugin = openai.LLM(
        model="gpt-4o-mini",
        api_key=settings.OPENAI_API_KEY.get_secret_value(),
    )

    # -- Build the Agent (defines persona and instructions) ------------
    agent = Agent(
        instructions=_SYSTEM_PROMPT,
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
        allow_interruptions=True,
    )

    # -- Build the AgentSession (runtime that drives the voice loop) ---
    session = AgentSession()

    # Attach controller for external access (e.g. by entrypoint hooks).
    session._interview_controller = controller  # type: ignore[attr-defined]

    return agent, session, controller
