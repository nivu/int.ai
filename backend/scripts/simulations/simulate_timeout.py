"""
Simulation of the 15-second no-response timeout in entrypoint.py.

Tests that:
  1. Silence for >15s after agent speaks fires user_state_changed(away)
     and the interview is terminated.
  2. A response within 15s cancels the timeout (normal flow continues).
  3. Timeout is NOT triggered during the greeting phase.
  4. Timeout is NOT triggered after the closing (_awaiting_close).

Run with:
    cd backend && .venv/bin/python simulate_timeout.py
"""

from __future__ import annotations

import asyncio
import json
import time
import unittest
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock


# ---------------------------------------------------------------------------
# Minimal stubs matching the SDK's event model
# ---------------------------------------------------------------------------

@dataclass
class FakeMessage:
    role: str
    _text: str

    @property
    def text_content(self) -> str | None:
        return self._text or None

    @property
    def content(self) -> list:
        return [self._text] if self._text else []


@dataclass
class ConversationItemAddedEvent:
    item: FakeMessage


@dataclass
class UserStateChangedEvent:
    new_state: str  # "listening" | "away"
    old_state: str = "listening"


class FakeSession:
    """Minimal AgentSession stub with event emission."""

    def __init__(self) -> None:
        self._handlers: dict[str, list] = {}
        self.said: list[str] = []
        self.ended = False

    def on(self, event: str):
        def decorator(fn):
            self._handlers.setdefault(event, []).append(fn)
            return fn
        return decorator

    def emit(self, event: str, payload: Any) -> None:
        for handler in self._handlers.get(event, []):
            handler(payload)

    async def say(self, text: str, **kwargs) -> None:
        self.said.append(text)

    async def start(self, **kwargs) -> None:
        pass


class FakeController:
    def __init__(self, max_questions: int = 3) -> None:
        self.max_questions = max_questions
        self.max_duration_seconds = 3600
        self.question_count = 0
        self.ended = False
        self.terminated = False
        self.finish_calls: list[str] = []

    def finish(self) -> None:
        self.ended = True
        self.finish_calls.append("finish")


# ---------------------------------------------------------------------------
# Replay the entrypoint logic (stripped of LiveKit/Supabase I/O)
# ---------------------------------------------------------------------------

class InterviewSimulator:
    """
    Replays the exact conversation-state machine from entrypoint.py,
    plus the user_state_changed handler.
    """

    def __init__(self, max_questions: int = 3) -> None:
        self.session = FakeSession()
        self.controller = FakeController(max_questions=max_questions)
        self.published: list[dict] = []
        self.terminated_reason: str | None = None
        self.shutdown_event = asyncio.Event()

        # Conversation state (mirrors entrypoint.py)
        self.last_agent_text = ""
        self.qa_number = 0
        self._interview_phase = ["greeting"]
        self._last_progress_sent = [0]
        self._repeat_used = [False]
        self._awaiting_close = [False]

        self._REPEAT_PHRASES = (
            "repeat", "say that again", "say it again", "come again",
            "what was the question", "pardon", "say again", "repeat that",
            "can you repeat", "could you repeat",
        )

        self._wire_handlers()

    def _extract_text(self, msg: FakeMessage) -> str:
        tc = getattr(msg, "text_content", None)
        if isinstance(tc, str) and tc.strip():
            return tc.strip()
        raw = getattr(msg, "content", []) or []
        parts = [c if isinstance(c, str) else getattr(c, "text", "") for c in raw]
        return " ".join(p for p in parts if p).strip()

    def _is_repeat_request(self, text: str) -> bool:
        if len(text.split()) > 15:
            return False
        return any(p in text.lower() for p in self._REPEAT_PHRASES)

    async def _publish_data(self, data: bytes) -> None:
        self.published.append(json.loads(data.decode()))

    def _wire_handlers(self) -> None:
        session = self.session

        # --- user_state_changed: 15-second timeout handler ---
        @session.on("user_state_changed")
        def _on_user_state_changed(event: UserStateChangedEvent) -> None:
            if event.new_state != "away":
                return
            if self._interview_phase[0] != "interview":
                return
            if self._awaiting_close[0] or self.controller.ended:
                return

            async def _terminate() -> None:
                if self.controller.ended:
                    return
                self.controller.terminated = True
                await self.session.say(
                    "I haven't heard a response in over 15 seconds. "
                    "Your session is now ending. Thank you.",
                    allow_interruptions=False,
                )
                await self._publish_data(json.dumps({"type": "terminated"}).encode())
                self.controller.finish()
                self.terminated_reason = "no_response"
                self.shutdown_event.set()

            asyncio.create_task(_terminate())

        # --- conversation_item_added handler ---
        @session.on("conversation_item_added")
        def _on_conversation_item(event: ConversationItemAddedEvent) -> None:
            item = event.item
            role = getattr(item, "role", None)
            if not role:
                return
            content = self._extract_text(item)
            if not content:
                return

            if role == "assistant":
                self.last_agent_text = content
                if self._interview_phase[0] == "interview" and not self._awaiting_close[0]:
                    expected_q = self.qa_number + 1
                    if (
                        expected_q <= self.controller.max_questions
                        and expected_q != self._last_progress_sent[0]
                    ):
                        self._last_progress_sent[0] = expected_q
                        asyncio.create_task(self._publish_data(
                            json.dumps({"type": "question_progress", "current": expected_q}).encode()
                        ))

            elif role == "user":
                if self._interview_phase[0] == "greeting":
                    self._interview_phase[0] = "interview"
                    self.last_agent_text = ""
                    return

                if not self.last_agent_text:
                    return
                if self._awaiting_close[0] or self.qa_number >= self.controller.max_questions:
                    self.last_agent_text = ""
                    return

                if self._is_repeat_request(content):
                    if not self._repeat_used[0]:
                        self._repeat_used[0] = True
                    else:
                        asyncio.create_task(self.session.say(
                            "I can only repeat each question once — please go ahead and answer.",
                            allow_interruptions=False,
                        ))
                    return

                self._repeat_used[0] = False
                self.qa_number += 1
                self.controller.question_count = self.qa_number
                self.last_agent_text = ""

                if self.qa_number >= self.controller.max_questions:
                    self._awaiting_close[0] = True

                    async def _close() -> None:
                        if self.controller.ended:
                            return
                        await self.session.say("That was the last question. Goodbye!")
                        await self._publish_data(json.dumps({"type": "session_end"}).encode())
                        self.controller.finish()
                        self.shutdown_event.set()

                    asyncio.create_task(_close())

    def agent_speaks(self, text: str) -> None:
        """Simulate agent asking a question."""
        self.session.emit("conversation_item_added",
                          ConversationItemAddedEvent(FakeMessage("assistant", text)))

    def user_speaks(self, text: str) -> None:
        """Simulate the user responding."""
        self.session.emit("conversation_item_added",
                          ConversationItemAddedEvent(FakeMessage("user", text)))

    def user_goes_silent_15s(self) -> None:
        """Simulate the SDK firing user_away after 15s of silence."""
        self.session.emit("user_state_changed",
                          UserStateChangedEvent(old_state="listening", new_state="away"))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTimeoutBehaviour(unittest.IsolatedAsyncioTestCase):

    async def _run(self, sim: InterviewSimulator, timeout: float = 5.0) -> None:
        """Wait for shutdown_event or timeout."""
        try:
            await asyncio.wait_for(sim.shutdown_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass

    # ------------------------------------------------------------------
    # Test 1: Silence after Q1 → terminate
    # ------------------------------------------------------------------
    async def test_silence_terminates_interview(self) -> None:
        print("\n[TEST 1] Silence for 15s after Q1 should terminate the interview")
        sim = InterviewSimulator(max_questions=3)

        # Greeting exchange
        sim.agent_speaks("Welcome! Are you ready?")
        sim.user_speaks("Yes, I'm ready.")

        # Agent asks Q1
        sim.agent_speaks("Q1: Tell me about yourself.")
        await asyncio.sleep(0)  # let tasks flush

        # Progress should have been published for Q1
        await asyncio.sleep(0)
        progress_msgs = [p for p in sim.published if p.get("type") == "question_progress"]
        self.assertEqual(progress_msgs[-1]["current"], 1, "Counter should be at 1")
        print(f"  ✓ question_progress sent: current={progress_msgs[-1]['current']}")

        # User goes silent for 15s
        sim.user_goes_silent_15s()
        await self._run(sim)

        self.assertTrue(sim.controller.terminated, "Controller should be marked terminated")
        self.assertEqual(sim.terminated_reason, "no_response")
        terminated_msgs = [p for p in sim.published if p.get("type") == "terminated"]
        self.assertTrue(terminated_msgs, "terminated data message should be published")
        said_texts = " ".join(sim.session.said)
        self.assertIn("15 seconds", said_texts)
        print(f"  ✓ Interview terminated — agent said: '{sim.session.said[-1][:60]}...'")

    # ------------------------------------------------------------------
    # Test 2: Response within time cancels timeout (normal flow)
    # ------------------------------------------------------------------
    async def test_response_cancels_timeout(self) -> None:
        print("\n[TEST 2] Responding within 15s should NOT terminate the interview")
        sim = InterviewSimulator(max_questions=2)

        sim.agent_speaks("Welcome! Ready?")
        sim.user_speaks("Yes, ready.")

        sim.agent_speaks("Q1: Describe your experience.")
        sim.user_speaks("I have 3 years of Python experience.")  # responds before timeout

        await asyncio.sleep(0)

        self.assertFalse(sim.controller.terminated, "Should not be terminated after response")
        self.assertEqual(sim.qa_number, 1, "Q&A count should be 1")
        print(f"  ✓ Interview continues — qa_number={sim.qa_number}, terminated={sim.controller.terminated}")

        # Now agent asks Q2 and user responds again → interview completes normally
        sim.agent_speaks("Q2: Why do you want this role?")
        sim.user_speaks("Because I'm passionate about AI.")
        await self._run(sim)

        self.assertFalse(sim.controller.terminated, "Should not be terminated")
        self.assertTrue(sim.controller.ended, "Should have ended normally")
        session_end_msgs = [p for p in sim.published if p.get("type") == "session_end"]
        self.assertTrue(session_end_msgs, "session_end should be published")
        print(f"  ✓ Interview ended normally — qa_number={sim.qa_number}")

    # ------------------------------------------------------------------
    # Test 3: Timeout does NOT fire during greeting
    # ------------------------------------------------------------------
    async def test_no_timeout_during_greeting(self) -> None:
        print("\n[TEST 3] Silence during greeting should NOT terminate the interview")
        sim = InterviewSimulator(max_questions=3)

        # Agent greets but user hasn't responded yet — SDK fires "away"
        sim.agent_speaks("Welcome! Are you ready?")
        sim.user_goes_silent_15s()  # silence during greeting phase
        await asyncio.sleep(0.1)

        self.assertFalse(sim.controller.terminated, "Should NOT terminate during greeting")
        self.assertFalse(sim.controller.ended)
        print(f"  ✓ Greeting silence ignored — terminated={sim.controller.terminated}")

    # ------------------------------------------------------------------
    # Test 4: Timeout does NOT fire during closing
    # ------------------------------------------------------------------
    async def test_no_timeout_during_closing(self) -> None:
        print("\n[TEST 4] Silence during closing should NOT terminate (already done)")
        sim = InterviewSimulator(max_questions=1)

        sim.agent_speaks("Welcome!")
        sim.user_speaks("Ready.")

        sim.agent_speaks("Q1: Tell me about yourself.")
        sim.user_speaks("I have 5 years of experience.")  # answers final question
        await asyncio.sleep(0)  # triggers _close_interview task

        # _awaiting_close is now True
        self.assertTrue(sim._awaiting_close[0], "_awaiting_close should be set")

        # SDK fires "away" during closing
        sim.user_goes_silent_15s()
        await asyncio.sleep(0.1)

        self.assertFalse(sim.controller.terminated, "Should NOT terminate during closing")
        print(f"  ✓ Closing silence ignored — terminated={sim.controller.terminated}")

    # ------------------------------------------------------------------
    # Test 5: Repeat once allowed, second repeat blocked
    # ------------------------------------------------------------------
    async def test_repeat_once_then_blocked(self) -> None:
        print("\n[TEST 5] Repeat allowed once, blocked on second request")
        sim = InterviewSimulator(max_questions=3)

        sim.agent_speaks("Welcome!")
        sim.user_speaks("Ready.")
        sim.agent_speaks("Q1: Tell me about Python decorators.")

        # First repeat request — allowed
        sim.user_speaks("Can you repeat that?")
        await asyncio.sleep(0)
        self.assertTrue(sim._repeat_used[0], "Repeat should be marked used")
        self.assertEqual(sim.qa_number, 0, "qa_number should NOT increment on repeat")
        no_repeat_msgs = [s for s in sim.session.said if "only repeat" in s]
        self.assertFalse(no_repeat_msgs, "Should NOT say 'only repeat' on first request")
        print(f"  ✓ First repeat allowed — qa_number still {sim.qa_number}")

        # Second repeat request — blocked
        sim.user_speaks("Repeat please")
        await asyncio.sleep(0)
        no_repeat_msgs = [s for s in sim.session.said if "only repeat" in s]
        self.assertTrue(no_repeat_msgs, "Should say 'only repeat' on second request")
        self.assertEqual(sim.qa_number, 0, "qa_number still should NOT increment")
        print(f"  ✓ Second repeat blocked — agent said: '{no_repeat_msgs[-1]}'")

    # ------------------------------------------------------------------
    # Test 6: Counter increments correctly across questions
    # ------------------------------------------------------------------
    async def test_counter_increments(self) -> None:
        print("\n[TEST 6] Question counter should increment for each question")
        sim = InterviewSimulator(max_questions=3)

        sim.agent_speaks("Welcome!")
        sim.user_speaks("Ready.")

        for i in range(1, 4):
            sim.agent_speaks(f"Q{i}: Question number {i}.")
            await asyncio.sleep(0)
            progress = [p for p in sim.published if p.get("type") == "question_progress"]
            self.assertEqual(progress[-1]["current"], i, f"Counter should be {i}")
            print(f"  ✓ Q{i} progress sent: current={progress[-1]['current']}")
            if i < 3:
                sim.user_speaks(f"My answer to question {i}.")

        sim.user_speaks("My answer to question 3.")
        await self._run(sim)
        self.assertTrue(sim.controller.ended)
        self.assertFalse(sim.controller.terminated)
        print(f"  ✓ Interview ended normally after 3 questions")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  Simulating 15-second timeout + interview logic")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestTimeoutBehaviour)
    runner = unittest.TextTestRunner(verbosity=0)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        print("  ALL TESTS PASSED ✓")
    else:
        print(f"  FAILURES: {len(result.failures)}  ERRORS: {len(result.errors)}")
    print("=" * 60)
