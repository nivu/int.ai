"""
End-to-end simulation of the AI interview question-limit logic.

Runs entirely in-process with no LiveKit, Deepgram, or Supabase connections.
Reproduces the exact event-handler behaviour from entrypoint.py so we can
verify the fix: the interviewer must ask exactly max_questions questions,
no more, no less.

Run with:
    cd backend && python simulate_interview.py
"""

from __future__ import annotations

import asyncio
import json
import time
import types
import unittest
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Minimal stubs for LiveKit / Supabase so we don't need real credentials
# ---------------------------------------------------------------------------

@dataclass
class FakeMessage:
    role: str
    text_content: str


@dataclass
class FakeEvent:
    item: FakeMessage


class FakeSession:
    """Minimal stand-in for livekit.agents.AgentSession."""

    def __init__(self) -> None:
        self._handlers: dict[str, list] = {}
        self.spoken: list[str] = []
        self._interview_controller = None

    def on(self, event_name: str):
        def decorator(fn):
            self._handlers.setdefault(event_name, []).append(fn)
            return fn
        return decorator

    async def say(self, text: str, allow_interruptions: bool = True) -> None:
        self.spoken.append(text)

    def fire(self, event_name: str, event: Any) -> None:
        for handler in self._handlers.get(event_name, []):
            handler(event)


# ---------------------------------------------------------------------------
# Replicate the _SessionController from agent.py (no external imports needed)
# ---------------------------------------------------------------------------

class SessionController:
    def __init__(self, session_id: str, max_questions: int, max_duration_seconds: int = 3600) -> None:
        self.session_id = session_id
        self.question_count = 0
        self.max_questions = max_questions
        self.max_duration_seconds = max_duration_seconds
        self.start_time = time.time()
        self.ended = False
        self.finish_calls = 0

    @property
    def elapsed_seconds(self) -> float:
        return time.time() - self.start_time

    @property
    def should_wrap_up(self) -> bool:
        return self.question_count >= self.max_questions

    def finish(self) -> None:
        if self.ended:
            return
        self.ended = True
        self.finish_calls += 1


# ---------------------------------------------------------------------------
# The exact event-handler logic from entrypoint.py (copy of the fixed version)
# ---------------------------------------------------------------------------

def build_interview_handler(session: FakeSession, controller: SessionController,
                             shutdown_event: asyncio.Event,
                             published_messages: list[dict],
                             stored_qa: list[dict]):
    """
    Returns (handler_fn, qa_state) mirroring _on_conversation_item from entrypoint.py.
    """
    last_agent_text_box = [""]   # mutable cell for nonlocal-like behaviour
    qa_number_box = [0]

    async def _publish_data(data: bytes) -> None:
        published_messages.append(json.loads(data.decode()))

    def _on_conversation_item(event) -> None:
        item = getattr(event, "item", None)
        if item is None:
            return

        msg = getattr(item, "message", item)
        role = getattr(msg, "role", None)
        content = getattr(msg, "text_content", None) or ""
        if not content:
            return

        if role == "assistant":
            last_agent_text_box[0] = content

        elif role == "user" and last_agent_text_box[0]:
            # ── Guard: ignore turns beyond the limit ──────────────────────
            if qa_number_box[0] >= controller.max_questions:
                last_agent_text_box[0] = ""
                return

            qa_number_box[0] += 1
            controller.question_count = qa_number_box[0]

            stored_qa.append({
                "question_number": qa_number_box[0],
                "question_text": last_agent_text_box[0],
                "answer_text": content,
            })

            # Progress event
            next_q = min(qa_number_box[0] + 1, controller.max_questions)
            asyncio.create_task(_publish_data(
                json.dumps({"type": "question_progress", "current": next_q}).encode()
            ))

            last_agent_text_box[0] = ""

            # ── Close immediately after last answer ───────────────────────
            if qa_number_box[0] >= controller.max_questions:
                async def _close_interview() -> None:
                    if not controller.ended:
                        await session.say(
                            "That was the last question. Thank you for your time and "
                            "thoughtful responses. The interview is now complete. "
                            "We will be in touch with the next steps soon. Goodbye!",
                            allow_interruptions=False,
                        )
                        await _publish_data(
                            json.dumps({"type": "session_end"}).encode()
                        )
                        controller.finish()
                        shutdown_event.set()
                asyncio.create_task(_close_interview())

    return _on_conversation_item, qa_number_box, last_agent_text_box


# ---------------------------------------------------------------------------
# Simulation helpers
# ---------------------------------------------------------------------------

def make_agent_event(text: str) -> FakeEvent:
    return FakeEvent(item=FakeMessage(role="assistant", text_content=text))


def make_user_event(text: str) -> FakeEvent:
    return FakeEvent(item=FakeMessage(role="user", text_content=text))


async def run_interview(max_questions: int, extra_turns_after_limit: int = 0):
    """
    Simulate a complete interview with max_questions rounds, then optionally
    fire extra user turns to check the guard holds.

    Returns (controller, session, stored_qa, published_messages).
    """
    session = FakeSession()
    controller = SessionController(session_id="sim-001", max_questions=max_questions)
    shutdown_event = asyncio.Event()
    published_messages: list[dict] = []
    stored_qa: list[dict] = []

    handler, qa_box, last_box = build_interview_handler(
        session, controller, shutdown_event, published_messages, stored_qa
    )
    session.on("conversation_item_added")(handler)

    # Simulate the agent's opening greeting (assistant turn with no prior agent text)
    session.fire("conversation_item_added", make_agent_event(
        "Hi! Welcome to your interview. Are you ready for the first question?"
    ))

    # Simulate each question-answer round
    sample_questions = [
        ("Tell me about your experience with Python.", "I've been using Python for 3 years..."),
        ("Explain how you'd design a REST API.", "I'd start with resource modeling..."),
        ("What's your approach to debugging production issues?", "First I check logs..."),
        ("Describe a challenging project you worked on.", "At my internship I built a trading bot..."),
        ("How do you handle code reviews?", "I focus on correctness and readability..."),
        ("What's your experience with OOP?", "I've built class hierarchies in Django..."),
        ("Explain async/await in Python.", "It allows non-blocking I/O via coroutines..."),
    ]

    for i in range(max_questions):
        q_text, a_text = sample_questions[i % len(sample_questions)]
        # Agent speaks the question
        session.fire("conversation_item_added", make_agent_event(f"Question {i+1}: {q_text}"))
        # Candidate answers
        session.fire("conversation_item_added", make_user_event(a_text))
        # Let async tasks run (close_interview, publish_data etc.)
        await asyncio.sleep(0)

    # ── Let the LLM "accidentally" ask extra questions (the old bug) ──────
    for i in range(extra_turns_after_limit):
        session.fire("conversation_item_added", make_agent_event(
            f"EXTRA question {max_questions + i + 1}: This should NOT be counted!"
        ))
        session.fire("conversation_item_added", make_user_event(
            "I'm answering the extra question but it should be ignored."
        ))
        await asyncio.sleep(0)

    # Allow all tasks to complete
    await asyncio.sleep(0.05)

    return controller, session, stored_qa, published_messages


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

class TestInterviewQuestionLimit(unittest.IsolatedAsyncioTestCase):

    async def test_exact_question_count_5(self):
        """Exactly 5 Q&A rounds are stored, no more."""
        controller, session, qa, published = await run_interview(max_questions=5)

        self.assertEqual(len(qa), 5, f"Expected 5 Q&A pairs, got {len(qa)}: {qa}")
        self.assertEqual(controller.question_count, 5)

    async def test_question_numbers_are_sequential(self):
        """Question numbers 1-N are assigned in order."""
        _, _, qa, _ = await run_interview(max_questions=3)
        numbers = [q["question_number"] for q in qa]
        self.assertEqual(numbers, [1, 2, 3])

    async def test_guard_blocks_extra_turns(self):
        """User responses after the limit are discarded — qa stays at max_questions."""
        controller, _, qa, _ = await run_interview(max_questions=3, extra_turns_after_limit=3)

        self.assertEqual(len(qa), 3, f"Guard failed — got {len(qa)} Q&A pairs instead of 3")
        self.assertEqual(controller.question_count, 3)

    async def test_close_fires_exactly_once(self):
        """controller.finish() is called exactly once."""
        controller, _, _, _ = await run_interview(max_questions=5, extra_turns_after_limit=2)
        self.assertEqual(controller.finish_calls, 1, "finish() should be called exactly once")

    async def test_session_end_published(self):
        """A session_end data message is published after the last question."""
        _, _, _, published = await run_interview(max_questions=3)
        end_events = [m for m in published if m.get("type") == "session_end"]
        self.assertEqual(len(end_events), 1, "Expected exactly one session_end message")

    async def test_closing_speech_spoken(self):
        """The closing 'Thank you' line is spoken exactly once."""
        _, session, _, _ = await run_interview(max_questions=3, extra_turns_after_limit=2)
        closing = [s for s in session.spoken if "last question" in s.lower()]
        self.assertEqual(len(closing), 1, f"Expected 1 closing speech, got {len(closing)}: {session.spoken}")

    async def test_shutdown_event_set(self):
        """shutdown_event is set so the entrypoint exits cleanly."""
        session = FakeSession()
        controller = SessionController(session_id="sim-shutdown", max_questions=2)
        shutdown_event = asyncio.Event()
        published: list[dict] = []
        qa: list[dict] = []

        handler, _, _ = build_interview_handler(session, controller, shutdown_event, published, qa)
        session.on("conversation_item_added")(handler)

        session.fire("conversation_item_added", make_agent_event("Question 1: Ready?"))
        session.fire("conversation_item_added", make_user_event("Yes, here is my answer."))
        await asyncio.sleep(0)

        session.fire("conversation_item_added", make_agent_event("Question 2: Tell me more."))
        session.fire("conversation_item_added", make_user_event("Sure, here is my second answer."))
        await asyncio.sleep(0.05)

        self.assertTrue(shutdown_event.is_set(), "shutdown_event was not set after final question")

    async def test_progress_events_published(self):
        """A question_progress event is published for each answered question."""
        _, _, _, published = await run_interview(max_questions=4)
        progress_events = [m for m in published if m.get("type") == "question_progress"]
        self.assertEqual(len(progress_events), 4)

    async def test_system_prompt_contains_limit(self):
        """_build_system_prompt includes the exact max_questions number."""
        from app.interview.agent import _build_system_prompt

        for n in [3, 5, 10]:
            prompt = _build_system_prompt(n)
            self.assertIn(str(n), prompt, f"max_questions={n} not found in system prompt")
            self.assertIn("Do NOT ask any further questions", prompt)

    async def test_single_question_interview(self):
        """Edge case: max_questions=1 should work correctly."""
        controller, session, qa, _ = await run_interview(max_questions=1, extra_turns_after_limit=2)
        self.assertEqual(len(qa), 1)
        self.assertEqual(controller.question_count, 1)
        closing = [s for s in session.spoken if "last question" in s.lower()]
        self.assertEqual(len(closing), 1)


# ---------------------------------------------------------------------------
# Human-readable summary run
# ---------------------------------------------------------------------------

async def _run_summary() -> None:
    print("\n" + "="*60)
    print("  INTERVIEW SIMULATION — END-TO-END FLOW (max_questions=5)")
    print("="*60)

    controller, session, qa, published = await run_interview(
        max_questions=5, extra_turns_after_limit=2
    )

    print(f"\n{'Q&A pairs recorded:':<35} {len(qa)}")
    for item in qa:
        print(f"  Q{item['question_number']}: {item['question_text'][:60]}")
        print(f"       A: {item['answer_text'][:60]}")

    print(f"\n{'controller.question_count:':<35} {controller.question_count}")
    print(f"{'controller.ended:':<35} {controller.ended}")
    print(f"{'controller.finish_calls:':<35} {controller.finish_calls}")

    session_ends = [m for m in published if m.get("type") == "session_end"]
    progress_events = [m for m in published if m.get("type") == "question_progress"]
    print(f"\n{'session_end messages published:':<35} {len(session_ends)}")
    print(f"{'question_progress events:':<35} {len(progress_events)}")

    closing = [s for s in session.spoken if "last question" in s.lower()]
    print(f"{'closing speech fired:':<35} {len(closing)}")
    if closing:
        print(f"  → \"{closing[0][:80]}...\"")

    print("\n── Guard test (2 extra turns fired after limit) ──")
    print(f"  Q&A count stayed at: {len(qa)} (should be 5)")
    print(f"  finish() called:     {controller.finish_calls} time(s) (should be 1)")

    from app.interview.agent import _build_system_prompt
    prompt = _build_system_prompt(5)
    has_limit = "5" in prompt and "Do NOT ask any further questions" in prompt
    print(f"\n{'System prompt includes limit:':<35} {has_limit}")

    print("\n" + "="*60)
    all_ok = (
        len(qa) == 5
        and controller.question_count == 5
        and controller.finish_calls == 1
        and len(session_ends) == 1
        and has_limit
    )
    status = "ALL CHECKS PASSED" if all_ok else "SOME CHECKS FAILED"
    print(f"  {status}")
    print("="*60 + "\n")


if __name__ == "__main__":
    # Print the narrative summary first
    asyncio.run(_run_summary())

    # Then run the full test suite
    print("Running unittest suite...\n")
    unittest.main(argv=[""], verbosity=2, exit=True)
