"""LiveKit agent entrypoint for AI voice interviews."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time

from livekit.agents import (
    AgentStateChangedEvent,
    CloseEvent,
    JobContext,
    JobProcess,
    UserInputTranscribedEvent,
    UserStateChangedEvent,
    WorkerOptions,
    cli,
)

from app.config import settings
from app.interview.agent import create_interview_agent
from app.services.supabase import get_record, insert_record

logger = logging.getLogger("int.ai")
_FINAL_TTS_DRAIN_SECONDS = 1.0
_NO_RESPONSE_SECONDS = 15


def prewarm(proc: JobProcess) -> None:
    import livekit.plugins.deepgram  # noqa: F401
    import livekit.plugins.openai  # noqa: F401
    from livekit.plugins import silero as _silero
    _silero.VAD.load()
    logger.info("Agent process prewarmed (pid=%s)", proc)


def _extract_text(msg: object) -> str:
    """Extract plain text from a ChatMessage regardless of content structure."""
    tc = getattr(msg, "text_content", None)
    if isinstance(tc, str) and tc.strip():
        return tc.strip()
    raw = getattr(msg, "content", None) or []
    parts: list[str] = []
    for c in raw:
        if isinstance(c, str):
            parts.append(c)
        elif hasattr(c, "text") and isinstance(c.text, str):
            parts.append(c.text)
    return " ".join(parts).strip()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    room_name: str = ctx.room.name
    logger.info("Agent joined room: %s", room_name)

    if not room_name.startswith("interview-"):
        logger.error("Room name %r does not match expected format.", room_name)
        return

    session_id = room_name[len("interview-"):]

    # ------------------------------------------------------------------
    # Fetch session context
    # ------------------------------------------------------------------
    try:
        session_record = get_record("interview_sessions", session_id)
    except Exception:
        logger.exception("Failed to fetch session record=%s", session_id)
        return

    application_id: str = session_record.get("application_id", "")
    template_id: str = session_record.get("template_id", "")

    resume_markdown = ""
    jd_text = ""
    hiring_post: dict = {}
    try:
        application = get_record("applications", application_id)
        hiring_post_id = application.get("hiring_post_id", "")

        from app.services.supabase import supabase
        rd = supabase.table("resume_data").select("raw_markdown").eq(
            "application_id", application_id).limit(1).execute()
        if rd.data:
            resume_markdown = rd.data[0].get("raw_markdown", "")

        if hiring_post_id:
            hiring_post = get_record("hiring_posts", hiring_post_id)
            jd_text = hiring_post.get("description", "")
    except Exception:
        logger.exception("Failed to fetch application context for session=%s", session_id)

    template_config: dict = {}
    try:
        template = get_record("interview_templates", template_id)
        template_config = {
            "max_questions": template.get("max_questions", 10),
            "max_duration_seconds": template.get("max_duration_minutes", 45) * 60,
            "foundational_ratio": template.get("foundational_ratio", 0.6),
            "job_title": hiring_post.get("title", "") if hiring_post else "",
        }
    except Exception:
        logger.exception("Failed to fetch template=%s session=%s", template_id, session_id)

    # ------------------------------------------------------------------
    # Create and start agent
    # ------------------------------------------------------------------
    agent, session, controller = create_interview_agent(
        session_id=session_id,
        resume_markdown=resume_markdown,
        jd_text=jd_text,
        template_config=template_config,
    )
    logger.info("Starting agent session=%s max_questions=%d", session_id, controller.max_questions)
    await session.start(agent=agent, room=ctx.room)

    shutdown_event = asyncio.Event()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    async def _publish_data(data: bytes) -> None:
        try:
            await ctx.room.local_participant.publish_data(data, reliable=True)
        except Exception:
            logger.exception("Failed to publish data session=%s", session_id)

    async def _send_termination_email(reason: str) -> None:
        try:
            from app.services.supabase import supabase as _sb
            from app.services import email as _email
            _app = _sb.table("applications").select("candidate_id,hiring_post_id").eq(
                "id", application_id).single().execute().data
            _cand = _sb.table("candidates").select("email,full_name").eq(
                "id", _app["candidate_id"]).single().execute().data
            _post = _sb.table("hiring_posts").select("title").eq(
                "id", _app["hiring_post_id"]).single().execute().data
            _email.send_interview_terminated(
                candidate_email=_cand["email"],
                candidate_name=_cand["full_name"],
                job_title=_post["title"],
                reason=reason,
            )
        except Exception:
            logger.exception("Failed to send termination email session=%s", session_id)

    # ------------------------------------------------------------------
    # Conversation state
    # ------------------------------------------------------------------
    _last_agent_text: list[str] = [""]
    # Stores only the pure question text for repeats — never includes the
    # LLM's acknowledgement prefix ("Great answer! Now...").
    _repeatable_question: list[str] = [""]
    _qa_number: list[int] = [0]

    _interview_phase: list[str] = ["greeting"]   # "greeting" | "interview"
    _last_progress_sent: list[int] = [0]
    _repeat_used: list[bool] = [False]
    _awaiting_close: list[bool] = [False]

    # Accumulates Deepgram final-transcript segments across multiple STT events.
    # Consumed and cleared when _advance_question() fires.
    _current_answer_parts: list[list[str]] = [[]]

    _agent_state: list[str] = ["initializing"]
    _user_state: list[str] = ["listening"]
    _current_question_topic: list[str] = ["general"]

    # ------------------------------------------------------------------
    # Timer state
    # ------------------------------------------------------------------
    _timer_remaining: list[float] = [float(_NO_RESPONSE_SECONDS)]
    _timer_seg_start: list[float | None] = [None]
    _no_response_task: list[asyncio.Task | None] = [None]
    _advancing: list[bool] = [False]

    # Grace period: after user stops speaking, wait this long before deciding
    # what to do (resume timer or advance based on word count).
    _SPEAK_GRACE_SECONDS = 3.0
    _grace_task: list[asyncio.Task | None] = [None]

    # Silence thresholds per word-count tier (used after grace period).
    # If word count < 6: resume timer (not enough to be a real answer).
    # Otherwise: wait tier-appropriate silence then advance as answered=True.
    _SILENCE_TIERS = [
        (11, float("inf"), None),   # 0–10 words → resume timer
        (16, 11,           4.0),    # 11–15 words → 4 s silence
        (31, 16,           3.0),    # 16–30 words → 3 s silence
        (float("inf"), 31, 2.0),    # 31+ words  → 2 s silence
    ]

    _REPEAT_PHRASES = (
        "repeat", "say that again", "say it again", "come again",
        "what was the question", "pardon", "say again", "repeat that",
        "can you repeat", "could you repeat",
    )

    def _get_word_count() -> int:
        return sum(len(p.split()) for p in _current_answer_parts[0])

    def _silence_needed(word_count: int) -> float | None:
        """Seconds of silence needed to advance, or None to resume timer."""
        if word_count <= 10:
            return None
        elif word_count <= 15:
            return 4.0
        elif word_count <= 30:
            return 3.0
        else:
            return 2.0

    def _is_repeat_request(text: str) -> bool:
        return len(text.split()) <= 15 and any(p in text.lower() for p in _REPEAT_PHRASES)

    # ------------------------------------------------------------------
    # Timer management
    # ------------------------------------------------------------------
    def _cancel_no_response_task(reason: str = "") -> None:
        t = _no_response_task[0]
        if t and not t.done():
            t.cancel()
            if reason:
                logger.debug("Timer cancelled (%s) session=%s", reason, session_id)
        _no_response_task[0] = None
        _timer_seg_start[0] = None

    def _cancel_grace_task() -> None:
        t = _grace_task[0]
        if t and not t.done():
            t.cancel()
        _grace_task[0] = None

    def _arm_timer(event_type: str = "timer_started") -> None:
        """Arm the no-response countdown from _timer_remaining[0].

        Only fires when:
        - In interview phase
        - Not closing
        - A question is active (_last_agent_text set)
        - No timer already running
        
        Args:
            event_type: "timer_started" for new question, "timer_resumed" for resume after pause
        """
        if (
            _interview_phase[0] != "interview"
            or _awaiting_close[0]
            or controller.ended
            or _no_response_task[0] is not None
            or not _last_agent_text[0]
        ):
            return

        remaining = _timer_remaining[0]
        _timer_seg_start[0] = time.monotonic()

        async def _timeout() -> None:
            try:
                await asyncio.sleep(remaining)
            except asyncio.CancelledError:
                return
            if controller.ended or _awaiting_close[0] or _interview_phase[0] != "interview":
                return
            if _user_state[0] == "speaking":
                return
            _no_response_task[0] = None
            _timer_seg_start[0] = None
            logger.warning("No-response timer expired session=%s", session_id)
            # If candidate said anything at all treat as answered so we don't
            # rudely say "I didn't hear a response" when they did speak.
            has_words = _get_word_count() > 0
            await _advance_question(answered=has_words)

        _no_response_task[0] = asyncio.create_task(_timeout())
        logger.info("Timer armed %.1fs (event=%s) session=%s", remaining, event_type, session_id)
        asyncio.create_task(_publish_data(
            json.dumps({"type": event_type, "remaining": math.ceil(remaining)}).encode()
        ))

    # ------------------------------------------------------------------
    # Central advance — ONLY place questions are incremented
    # ------------------------------------------------------------------
    async def _advance_question(answered: bool) -> None:
        if controller.ended or _awaiting_close[0] or _advancing[0]:
            return
        _advancing[0] = True
        try:
            await _do_advance(answered)
        finally:
            _advancing[0] = False

    async def _do_advance(answered: bool) -> None:
        if not _last_agent_text[0]:
            logger.debug("No active question — skipping advance session=%s", session_id)
            return

        _cancel_no_response_task("advance")
        _cancel_grace_task()
        _timer_remaining[0] = float(_NO_RESPONSE_SECONDS)

        answer_text = " ".join(_current_answer_parts[0]).strip()
        _current_answer_parts[0] = []
        _repeat_used[0] = False

        _qa_number[0] += 1
        controller.question_count = _qa_number[0]
        current_q = _qa_number[0]
        question_text = _last_agent_text[0]
        _last_agent_text[0] = ""

        logger.info(
            "Advancing Q#%d/%d answered=%s words=%d session=%s",
            current_q, controller.max_questions, answered, len(answer_text.split()), session_id,
        )

        # Persist Q&A
        if question_text:
            try:
                insert_record("interview_qa", {
                    "session_id": session_id,
                    "question_number": current_q,
                    "question_type": "foundational",
                    "question_text": question_text,
                    "answer_text": answer_text,
                })
            except Exception:
                logger.exception("Failed to store Q&A #%d session=%s", current_q, session_id)

            if answered and answer_text:
                controller.question_gen.conversation_history.append({
                    "question": question_text,
                    "answer": answer_text,
                    "topic": _current_question_topic[0],
                })
            else:
                controller.question_gen.conversation_history.append({
                    "question": question_text,
                    "answer": "[no answer — candidate did not respond]",
                    "topic": _current_question_topic[0],
                })

        # Last question → close
        if current_q >= controller.max_questions:
            await _close_interview()
            return

        next_q = current_q + 1
        _last_progress_sent[0] = next_q
        await _publish_data(
            json.dumps({"type": "question_progress", "current": next_q}).encode()
        )

        if not answered:
            # ----------------------------------------------------------------
            # Candidate was completely silent.
            # Bypass the LLM entirely — fetch the next question directly from
            # the question generator and speak it as a single hardcoded line.
            # This prevents the LLM from generating a spurious acknowledgement
            # like "Fantastic explanation!" when the candidate said nothing.
            # ----------------------------------------------------------------
            try:
                q_data = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: controller.question_gen.generate_next_question(
                        controller.foundational_ratio
                    ),
                )
                next_q_text = q_data.get("question_text", "").strip()
                _current_question_topic[0] = q_data.get("topic", "general")
            except Exception:
                logger.exception("Failed to generate Q#%d session=%s", next_q, session_id)
                next_q_text = ""

            move_on = "I didn't hear a response, so let's move on."
            full_text = f"{move_on} {next_q_text}" if next_q_text else move_on
            await session.say(full_text, allow_interruptions=False)

            # Set the active question text so the timer guard works on the
            # next agent_state_changed → listening event.
            _last_agent_text[0] = next_q_text if next_q_text else ""
            if next_q_text:
                _repeatable_question[0] = next_q_text
            logger.info("Skipped Q#%d, spoke Q#%d directly session=%s", current_q, next_q, session_id)
            # Timer will be armed by _on_agent_state_changed when agent → listening
            return

        # ----------------------------------------------------------------
        # Candidate answered — pre-generate next question so the topic is
        # tracked and the LLM delivers a role-specific question.
        # ----------------------------------------------------------------
        next_q_text = ""
        next_q_topic = "general"
        try:
            q_data = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: controller.question_gen.generate_next_question(
                    controller.foundational_ratio
                ),
            )
            next_q_text = q_data.get("question_text", "").strip()
            next_q_topic = q_data.get("topic", "general")
        except Exception:
            logger.exception("Failed to pre-generate Q#%d session=%s", next_q, session_id)

        _current_question_topic[0] = next_q_topic
        if next_q_text:
            _repeatable_question[0] = next_q_text

        try:
            controller.explicit_generate_count += 1
            instructions = (
                f"Question {current_q} of {controller.max_questions} is complete. "
                f"Briefly acknowledge the candidate's answer (1 sentence max), "
                f"then ask this exact question naturally: {next_q_text}"
                if next_q_text else
                f"Question {current_q} of {controller.max_questions} is complete. "
                f"Briefly acknowledge the candidate's answer (1 sentence max), "
                f"then ask a new question on a completely different topic relevant to the role."
            )
            session.generate_reply(
                instructions=instructions,
                allow_interruptions=False,
            )
            logger.info(
                "generate_reply scheduled Q#%d topic=%r session=%s",
                next_q, next_q_topic, session_id,
            )
        except Exception:
            logger.exception("Failed to schedule generate_reply session=%s", session_id)

    # ------------------------------------------------------------------
    # Close interview
    # ------------------------------------------------------------------
    async def _close_interview() -> None:
        if controller.ended:
            return
        _awaiting_close[0] = True
        controller.closing = True
        _cancel_no_response_task("closing")
        _cancel_grace_task()

        # Tell frontend immediately: clear timer, show wrapping-up state.
        await _publish_data(json.dumps({"type": "interview_closing"}).encode())

        try:
            await session.interrupt()
        except Exception:
            pass

        await session.say(
            "That was the last question. Thank you for your time and thoughtful "
            "responses. The interview is now complete. We'll be in touch soon. Goodbye!",
            allow_interruptions=False,
        )

        # Give TTS time to fully play before disconnecting.
        await asyncio.sleep(3.0)
        await _publish_data(json.dumps({"type": "session_end"}).encode())
        controller.finish()
        shutdown_event.set()

    # ------------------------------------------------------------------
    # agent_state_changed
    # ------------------------------------------------------------------
    @session.on("agent_state_changed")
    def _on_agent_state_changed(event: AgentStateChangedEvent) -> None:
        _agent_state[0] = event.new_state

        if event.new_state == "speaking":
            # Cancel timer while agent is speaking — candidate can't answer yet.
            _cancel_no_response_task("agent_speaking")
            if _interview_phase[0] == "interview" and not _awaiting_close[0]:
                asyncio.create_task(_publish_data(
                    json.dumps({"type": "agent_speaking"}).encode()
                ))
            # Send Q1 progress on first agent speech in interview phase.
            if _interview_phase[0] == "interview" and not _awaiting_close[0]:
                if _last_progress_sent[0] == 0:
                    _last_progress_sent[0] = 1
                    asyncio.create_task(_publish_data(
                        json.dumps({"type": "question_progress", "current": 1}).encode()
                    ))
                    logger.info("question_progress current=1 session=%s", session_id)

        elif event.new_state == "listening":
            # Agent finished speaking and is now listening for the candidate.
            # Arm the timer if a question is active and no timer is running.
            # The _last_agent_text guard prevents arming during the brief
            # "listening" flash between generate_reply() and the next question.
            if (
                _interview_phase[0] == "interview"
                and not _awaiting_close[0]
                and not controller.ended
                and bool(_last_agent_text[0])
                and _no_response_task[0] is None
                and _grace_task[0] is None
            ):
                _arm_timer()

    # ------------------------------------------------------------------
    # user_state_changed — pause/resume timer around speech
    # ------------------------------------------------------------------
    @session.on("user_state_changed")
    def _on_user_state_changed(event: UserStateChangedEvent) -> None:
        old_state = _user_state[0]
        _user_state[0] = event.new_state
        logger.debug("User state %s→%s session=%s", old_state, event.new_state, session_id)

        if event.new_state == "speaking":
            # User started speaking — pause the timer immediately.
            _cancel_grace_task()
            if _timer_seg_start[0] is not None:
                elapsed = time.monotonic() - _timer_seg_start[0]
                _timer_remaining[0] = max(0.0, _timer_remaining[0] - elapsed)
                logger.debug("Timer paused at %.1fs session=%s", _timer_remaining[0], session_id)
            _cancel_no_response_task("user_speaking")
            asyncio.create_task(_publish_data(
                json.dumps({
                    "type": "user_speaking",
                    "remaining": math.ceil(_timer_remaining[0])
                }).encode()
            ))

        elif old_state == "speaking" and event.new_state != "speaking":
            # User stopped speaking — start grace period.
            if (
                _interview_phase[0] != "interview"
                or _awaiting_close[0]
                or controller.ended
                or _agent_state[0] != "listening"
            ):
                return

            asyncio.create_task(_publish_data(
                json.dumps({
                    "type": "grace_period_started",
                    "duration": _SPEAK_GRACE_SECONDS,
                    "remaining": math.ceil(_timer_remaining[0]),
                }).encode()
            ))

            async def _grace_then_decide() -> None:
                # Phase 1: initial grace period (3 s).
                # If user speaks again, this task is cancelled and the whole
                # process restarts from user_state_changed → speaking.
                try:
                    await asyncio.sleep(_SPEAK_GRACE_SECONDS)
                except asyncio.CancelledError:
                    return

                if (
                    _interview_phase[0] != "interview"
                    or _awaiting_close[0]
                    or controller.ended
                    or _user_state[0] == "speaking"
                    or _advancing[0]
                ):
                    return

                _grace_task[0] = None
                word_count = _get_word_count()
                extra_silence = _silence_needed(word_count)

                if extra_silence is None:
                    # Too few words — candidate hasn't really answered.
                    # Resume the no-response countdown from remaining time.
                    logger.debug(
                        "Grace done, %d words ≤ 10 — resuming timer at %.1fs session=%s",
                        word_count, _timer_remaining[0], session_id,
                    )
                    _arm_timer("timer_resumed")
                    return

                # Phase 2: tier-appropriate confirmation silence.
                # Notify frontend to keep timer hidden (still in grace).
                logger.debug(
                    "Grace done, %d words — waiting %.1fs confirmation silence session=%s",
                    word_count, extra_silence, session_id,
                )
                asyncio.create_task(_publish_data(
                    json.dumps({
                        "type": "grace_period_started",
                        "duration": extra_silence,
                        "remaining": math.ceil(_timer_remaining[0]),
                    }).encode()
                ))

                try:
                    await asyncio.sleep(extra_silence)
                except asyncio.CancelledError:
                    return

                # Final guard before advancing.
                if (
                    _interview_phase[0] != "interview"
                    or _awaiting_close[0]
                    or controller.ended
                    or _user_state[0] == "speaking"
                    or _advancing[0]
                ):
                    return

                logger.info(
                    "Silence confirmed %d words / %.1fs — advancing session=%s",
                    word_count, extra_silence, session_id,
                )
                asyncio.create_task(_advance_question(answered=True))

            _grace_task[0] = asyncio.create_task(_grace_then_decide())
            logger.debug("Grace started %.1fs remaining=%.1fs session=%s",
                         _SPEAK_GRACE_SECONDS, _timer_remaining[0], session_id)

    # ------------------------------------------------------------------
    # user_input_transcribed — accumulate transcript segments
    # ------------------------------------------------------------------
    @session.on("user_input_transcribed")
    def _on_user_input_transcribed(event: UserInputTranscribedEvent) -> None:
        if event.is_final and event.transcript and event.transcript.strip():
            _current_answer_parts[0].append(event.transcript.strip())
            logger.info(
                "Transcript segment len=%d parts=%d session=%s",
                len(event.transcript.strip()), len(_current_answer_parts[0]), session_id,
            )

    # ------------------------------------------------------------------
    # conversation_item_added — track agent text; handle greeting/repeats
    # ------------------------------------------------------------------
    @session.on("conversation_item_added")
    def _on_conversation_item(event: object) -> None:
        item = getattr(event, "item", None)
        if item is None:
            return
        role = getattr(item, "role", None)
        if not role:
            return

        if role == "assistant":
            content = _extract_text(item)
            if content:
                _last_agent_text[0] = content
                # For Q1 only (before any _do_advance has run), treat the full
                # agent text as the repeatable question. After Q1, _do_advance
                # always sets _repeatable_question to the pre-generated question
                # text — never let a later LLM utterance overwrite it.
                if not _repeatable_question[0] and _qa_number[0] == 0:
                    _repeatable_question[0] = content

        elif role == "user":
            content = _extract_text(item)
            if not content:
                content = " ".join(_current_answer_parts[0]).strip()

            logger.debug("User item phase=%s content=%r session=%s",
                         _interview_phase[0], content[:80] if content else "", session_id)

            if _interview_phase[0] == "greeting":
                _cancel_no_response_task()
                _interview_phase[0] = "interview"
                _last_agent_text[0] = ""
                logger.info("→ interview phase session=%s", session_id)
                controller.explicit_generate_count += 1
                try:
                    session.generate_reply(
                        instructions="Start the interview. Ask the first question now.",
                        allow_interruptions=False,
                    )
                except Exception:
                    logger.exception("Failed to trigger Q1 session=%s", session_id)
                return

            if _interview_phase[0] != "interview" or _awaiting_close[0]:
                return

            if not _last_agent_text[0]:
                logger.debug("No active question — ignoring user item session=%s", session_id)
                return

            # Repeat request
            if content and _is_repeat_request(content):
                if not _repeat_used[0]:
                    _repeat_used[0] = True
                    # Use _repeatable_question (pure question text only) so the
                    # repeat never includes the LLM's acknowledgement of the
                    # previous answer. Fall back to _last_agent_text for Q1
                    # where no separate question text has been stored yet.
                    question_to_repeat = _repeatable_question[0] or _last_agent_text[0]
                    logger.info("Repeat (first) Q#%d session=%s", _qa_number[0] + 1, session_id)

                    async def _do_repeat() -> None:
                        try:
                            await session.interrupt()
                        except Exception:
                            pass
                        await session.say(question_to_repeat, allow_interruptions=False)
                    asyncio.create_task(_do_repeat())
                else:
                    logger.info("Repeat (blocked) session=%s", session_id)

                    async def _do_repeat_blocked() -> None:
                        try:
                            await session.interrupt()
                        except Exception:
                            pass
                        await session.say(
                            "I can only repeat each question once — please go ahead and answer.",
                            allow_interruptions=False,
                        )
                    asyncio.create_task(_do_repeat_blocked())
                return

            # Normal user turn committed by Deepgram.
            # Do NOT advance here — the grace/silence logic in user_state_changed
            # is the sole advancement path for answered questions.
            # This handler only tracks the transcript for repeat detection.
            logger.debug(
                "User turn committed Q#%d — grace/silence logic will advance session=%s",
                _qa_number[0] + 1, session_id,
            )

    # ------------------------------------------------------------------
    # Data channel: tab-switch
    # ------------------------------------------------------------------
    @ctx.room.on("data_received")
    def _on_data_received(packet, *args, **kwargs) -> None:
        # Newer livekit-rtc fires with a DataPacket object; older versions pass
        # raw bytes directly.  Handle both so tab_switch is never silently lost.
        try:
            raw: bytes = packet.data if hasattr(packet, "data") else bytes(packet)
        except Exception as e:
            logger.warning("data_received: cannot extract bytes session=%s error=%s", session_id, e)
            return
        logger.debug("Data received in room session=%s data=%s", session_id, raw[:100])
        try:
            msg = json.loads(raw.decode())
            logger.info("Parsed data message session=%s type=%s", session_id, msg.get("type"))
        except Exception as e:
            logger.warning("Failed to parse data message session=%s error=%s", session_id, e)
            return

        if msg.get("type") == "tab_switch" and not controller.ended:
            logger.warning("Tab switch detected - initiating termination session=%s", session_id)

            async def _terminate_tab_switch() -> None:
                _cancel_no_response_task()
                _cancel_grace_task()
                controller.terminated = True

                timer_snap = _timer_remaining[0]
                if _timer_seg_start[0] is not None:
                    elapsed = time.monotonic() - _timer_seg_start[0]
                    timer_snap = max(0.0, timer_snap - elapsed)

                try:
                    from app.services.supabase import update_record as _upd
                    _upd("interview_sessions", session_id, {
                        "status": "terminated_tab_switch",
                        "terminated_at_question": _qa_number[0] + 1,
                        "timer_remaining_at_termination": timer_snap,
                    })
                    logger.info("Updated session status to terminated_tab_switch session=%s", session_id)
                except Exception:
                    logger.exception("Failed to persist termination metadata session=%s", session_id)

                await _publish_data(json.dumps({"type": "terminated"}).encode())
                controller.finish()
                await _send_termination_email("tab_switch")
                shutdown_event.set()
                logger.info("Tab switch termination complete session=%s", session_id)

            asyncio.create_task(_terminate_tab_switch())

    # ------------------------------------------------------------------
    # Greeting
    # ------------------------------------------------------------------
    await session.say(
        f"Hi there! Welcome to your interview. I'm your AI interviewer today. "
        f"A few quick rules before we begin: "
        f"Do not switch tabs — any tab switch will immediately end the session. "
        f"After each question, you have {_NO_RESPONSE_SECONDS} seconds of silence before I move on. "
        f"You can speak for as long as you need — the timer only counts down when you are not speaking. "
        f"You may ask me to repeat a question once by saying 'repeat'. "
        f"Alright, let's get started. Are you ready?",
        allow_interruptions=False,
    )

    # ------------------------------------------------------------------
    # Duration watchdog
    # ------------------------------------------------------------------
    async def _duration_watchdog() -> None:
        await asyncio.sleep(controller.max_duration_seconds)
        if not controller.ended:
            logger.info("Duration limit reached session=%s", session_id)
            _cancel_no_response_task()
            _cancel_grace_task()
            await session.say(
                "We've reached the end of our allotted time. Thank you for your responses. "
                "The interview is now complete. We will be in touch soon. Goodbye!",
                allow_interruptions=False,
            )
            await asyncio.sleep(3.0)
            await _publish_data(json.dumps({"type": "session_end"}).encode())
            controller.finish()
            shutdown_event.set()

    asyncio.create_task(_duration_watchdog())

    @session.on("close")
    def _on_close(event: CloseEvent) -> None:
        _cancel_grace_task()
        _cancel_no_response_task()
        controller.finish()
        shutdown_event.set()

    @ctx.room.on("disconnected")
    def _on_room_disconnect() -> None:
        _cancel_grace_task()
        _cancel_no_response_task()
        controller.finish()
        shutdown_event.set()

    await shutdown_event.wait()


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
