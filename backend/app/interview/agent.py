"""LiveKit Agent factory for AI voice interviews.

Creates a fully configured Agent + AgentSession that conducts technical
interviews using Deepgram STT/TTS and OpenAI GPT-4o mini as the backing LLM.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from livekit.agents import Agent, AgentSession
from livekit.plugins import deepgram, openai, silero


from app.config import settings
from app.interview.question_gen import QuestionGenerator
from app.services.supabase import update_record
from app.worker import celery_app

logger = logging.getLogger("int.ai")

# Load Silero VAD once at module level so each session doesn't re-initialise
# the ONNX model from disk.
_vad = silero.VAD.load()


# ---------------------------------------------------------------------------
# System prompt for the AI interviewer persona
# ---------------------------------------------------------------------------
def _build_system_prompt(max_questions: int, job_title: str = "") -> str:
    role_line = f" for a {job_title} position" if job_title else ""
    return f"""\
You are a professional yet warm AI technical interviewer for int.ai, conducting an interview{role_line}.

This interview has exactly {max_questions} question(s). You must ask no more \
and no fewer than {max_questions} question(s) in total.

Guidelines:
- Greet the candidate briefly at the start and make them feel comfortable.
- After each answer, acknowledge what the candidate said before transitioning
  to the next question (e.g. "That's a great point about X. Let's move on to...").
- Keep transitions natural and conversational; never sound robotic.
- Persona and tone are your only responsibilities.
- Interview control flow (timer, repeat limits, tab-switch handling, and session
  closing) is enforced entirely by the system code.
- When asked to deliver a question by the system, ask it naturally.
- When a candidate answers, briefly acknowledge before transitioning.

You will receive the next question to ask from the question generator. Deliver
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
        job_title: str = "",
        foundational_ratio: float = 0.6,
    ) -> None:
        self.session_id = session_id
        self.question_count = 0
        self.max_questions = max_questions
        self.max_duration_seconds = max_duration_seconds
        self.foundational_ratio = foundational_ratio
        self.start_time = time.time()
        self.ended = False
        self.terminated = False  # set True for tab-switch/timeout so no reset-to-pending occurs
        self.closing = False     # set True once the last answer is recorded
        self.explicit_generate_count: int = 0  # must be > 0 for llm_node to allow generation

        self.question_gen = QuestionGenerator(
            resume_markdown=resume_markdown,
            jd_text=jd_text,
            job_title=job_title,
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

        from datetime import datetime, timezone
        duration = int(self.elapsed_seconds)

        # If the candidate disconnected before answering any questions AND this was
        # not an explicit termination (tab switch / timeout), reset to pending so
        # they can retry after a genuine connection issue.
        if self.question_count == 0 and not self.terminated:
            try:
                from datetime import timedelta
                new_deadline = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
                update_record(
                    "interview_sessions",
                    self.session_id,
                    {
                        "status": "pending",
                        "started_at": None,
                        "ended_at": None,
                        "duration_seconds": None,
                        "questions_asked": 0,
                        "livekit_room_name": None,
                        "consent_given_at": None,
                        "reconnection_token": None,
                        "reconnection_expires_at": None,
                        "deadline": new_deadline,
                    },
                )
                logger.info("Session %s reset to pending (0 questions answered)", self.session_id)
            except Exception:
                logger.exception("Failed to reset session %s", self.session_id)
            return

        # For terminated sessions the status was already set to terminated_tab_switch
        # or terminated_abandoned before finish() was called.  Only update the
        # bookkeeping fields; do not overwrite the termination status.
        update_fields: dict = {
            "duration_seconds": duration,
            "questions_asked": self.question_count,
            "ended_at": datetime.now(timezone.utc).isoformat(),
        }
        if not self.terminated:
            update_fields["status"] = "completed"

        try:
            update_record("interview_sessions", self.session_id, update_fields)
        except Exception:
            logger.exception(
                "Failed to update session %s on completion", self.session_id
            )

        # Do not evaluate terminated sessions — no complete transcript to score.
        if self.terminated:
            logger.info(
                "Session %s was terminated — skipping evaluation task", self.session_id
            )
            return

        try:
            celery_app.send_task(
                "evaluate_interview_task",
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
# Agent subclass — blocks LLM generation once the interview is closing
# ---------------------------------------------------------------------------
class InterviewAgent(Agent):
    """Extends Agent to gate the LLM node after max_questions is reached.

    Overriding llm_node (the actual generation entry point) is the only
    reliable way to prevent a Q(n+1) from being generated while _close_interview
    runs concurrently.  on_user_turn_completed is just a hook — it does not
    control whether the LLM is called.
    """

    def __init__(self, controller: _SessionController, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._interview_controller = controller

    def llm_node(self, chat_ctx: Any, tools: Any, model_settings: Any) -> Any:
        ctrl = self._interview_controller
        if ctrl.closing:
            logger.info(
                "Blocking LLM generation — interview closing session=%s", ctrl.session_id
            )
            async def _noop_close() -> None:
                pass
            return _noop_close()
        if ctrl.explicit_generate_count > 0:
            ctrl.explicit_generate_count -= 1
            logger.info(
                "Allowing LLM generation (explicit) remaining=%d session=%s",
                ctrl.explicit_generate_count, ctrl.session_id,
            )
            return super().llm_node(chat_ctx, tools, model_settings)
        logger.info(
            "Blocking auto LLM generation session=%s", ctrl.session_id
        )
        async def _noop() -> None:
            pass
        return _noop()


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def create_interview_agent(
    session_id: str,
    resume_markdown: str,
    jd_text: str,
    template_config: dict[str, Any],
) -> tuple[Agent, AgentSession, _SessionController]:
    max_questions: int = template_config.get("max_questions", 10)
    max_duration: int = template_config.get("max_duration_seconds", 1800)
    foundational_ratio: float = template_config.get("foundational_ratio", 0.6)
    job_title: str = template_config.get("job_title", "")

    controller = _SessionController(
        session_id=session_id,
        resume_markdown=resume_markdown,
        jd_text=jd_text,
        max_questions=max_questions,
        max_duration_seconds=max_duration,
        job_title=job_title,
        foundational_ratio=foundational_ratio,
    )

    # -- STT: Deepgram Nova-2, Indian English, streaming ---------------
    # endpointing_ms=3500: Deepgram waits 3.5 s of silence before finalising a
    # transcript. This is the fallback path — the primary advancement path is
    # word-count-based (see entrypoint.py _on_user_input_transcribed).
    # 3.5s is long enough to avoid cutting off natural thinking pauses but
    # short enough to not feel frozen after the user finishes speaking.
    stt_plugin = deepgram.STT(
        model="nova-2",
        language="en-IN",
        api_key=settings.DEEPGRAM_API_KEY.get_secret_value(),
        endpointing_ms=3500,
    )

    # -- TTS: Deepgram Aura, streaming ---------------------------------
    # aura-asteria-en is Deepgram's primary production English voice.
    # No encoding/sample_rate override — the LiveKit Deepgram plugin
    # handles format negotiation internally. Forcing opus caused broken
    # audio chunks because Deepgram TTS streams PCM, not Opus.
    tts_plugin = deepgram.TTS(
        model="aura-luna-en",
        api_key=settings.DEEPGRAM_API_KEY.get_secret_value(),
    )

    # -- LLM: OpenAI GPT-4o mini --------------------------------------
    llm_plugin = openai.LLM(
        model="gpt-4o-mini",
        api_key=settings.OPENAI_API_KEY.get_secret_value(),
    )

    # -- Build the Agent (defines persona and instructions) ------------
    agent = InterviewAgent(
        controller=controller,
        instructions=_build_system_prompt(max_questions, job_title),
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
        allow_interruptions=False,
    )

    # -- Build the AgentSession ----------------------------------------
    # turn_detection="vad"  → Voice Activity Detection for turn boundaries.
    #
    # CRITICAL: Set discard_audio_if_uninterruptible=True.
    # This ensures that ALL audio captured while the agent is speaking is
    # immediately discarded, not buffered. Without this, background noise or
    # mic input during agent speech gets buffered and then processed when the
    # agent finishes, causing premature state flips to "listening" and false
    # VAD triggers that cut the agent off mid-sentence.
    #
    # With interruptions disabled (allow_interruptions=False), the candidate
    # cannot interrupt anyway, so discarding audio during agent speech is safe
    # and prevents all the buffering issues.
    #
    # endpointing.min_delay=3.5  → wait 3.5 s of silence before committing the
    #                              turn. Matches endpointing_ms above.
    #                              Primary advancement is word-count-based
    #                              (≥6 words + silence → advance immediately).
    # endpointing.max_delay=30.0 → allow up to 30 s of continuous speech
    #                              before force-committing a very long answer.
    #
    # preemptive_generation=False  → wait for full turn before LLM.
    session = AgentSession(
        vad=_vad,
        preemptive_generation=False,
        turn_handling={
            "turn_detection": "vad",
            "endpointing": {
                "min_delay": 3.5,
                "max_delay": 30.0,
            },
            "interruption": {
                "enabled": False,
                "discard_audio_if_uninterruptible": True,  # CRITICAL: discard, don't buffer
            },
        },
    )

    # Attach controller for external access (e.g. by entrypoint hooks).
    session._interview_controller = controller  # type: ignore[attr-defined]

    return agent, session, controller
