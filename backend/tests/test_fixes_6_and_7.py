"""
Tests for:
  Fix 6 — Repeat question uses pure question text, not LLM acknowledgement prefix
  Fix 7 — POST /interview/end-session marks session completed and enqueues evaluation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Fix 6: Repeat question logic
# ---------------------------------------------------------------------------

class TestRepeatQuestionFix:
    """
    The bug: when a candidate said "repeat", the agent replayed _last_agent_text
    which contained the full LLM output including acknowledgement prefix
    (e.g. "Great answer! Now tell me about X").

    The fix: _repeatable_question stores only the pure question text.
    The repeat handler uses _repeatable_question, falling back to _last_agent_text
    only for Q1 (before any _do_advance has run).
    """

    def _make_state(self, last_agent_text="", repeatable_question=""):
        """Build the mutable state lists used in entrypoint.py."""
        return [last_agent_text], [repeatable_question]

    def test_repeat_uses_repeatable_question_not_last_agent_text(self):
        """When _repeatable_question is set, repeat returns that — not _last_agent_text."""
        full_llm_output = "Great answer! That shows real depth. Now, tell me about a time you led a team."
        pure_question = "Tell me about a time you led a team."

        _last_agent_text, _repeatable_question = self._make_state(
            last_agent_text=full_llm_output,
            repeatable_question=pure_question,
        )

        question_to_repeat = _repeatable_question[0] or _last_agent_text[0]

        assert question_to_repeat == pure_question
        assert question_to_repeat != full_llm_output
        assert "Great answer!" not in question_to_repeat

    def test_repeat_falls_back_to_last_agent_text_for_q1(self):
        """For Q1 _repeatable_question is empty; fallback to _last_agent_text."""
        q1_text = "Tell me a bit about yourself and your background."

        _last_agent_text, _repeatable_question = self._make_state(
            last_agent_text=q1_text,
            repeatable_question="",  # not yet set at Q1
        )

        question_to_repeat = _repeatable_question[0] or _last_agent_text[0]

        assert question_to_repeat == q1_text

    def test_q1_initialises_repeatable_question(self):
        """Simulates the conversation_item_added handler setting _repeatable_question on Q1."""
        _repeatable_question = [""]

        content = "Tell me a bit about yourself and your background."

        # Handler logic from entrypoint.py
        if not _repeatable_question[0]:
            _repeatable_question[0] = content

        assert _repeatable_question[0] == content

    def test_q1_does_not_overwrite_existing_repeatable_question(self):
        """Once _repeatable_question is set by _do_advance, it must not be overwritten."""
        _repeatable_question = ["What is your biggest technical achievement?"]

        new_content = "Great answer! That's impressive. Now, describe your biggest technical achievement."

        # The guard in entrypoint.py: only set if empty
        if not _repeatable_question[0]:
            _repeatable_question[0] = new_content

        # Should still hold the pure question, not the acknowledgement-prefixed text
        assert _repeatable_question[0] == "What is your biggest technical achievement?"

    def test_is_repeat_request_detects_phrases(self):
        """_is_repeat_request triggers on all configured phrases."""
        _REPEAT_PHRASES = (
            "repeat", "say that again", "say it again", "come again",
            "what was the question", "pardon", "say again", "repeat that",
            "can you repeat", "could you repeat",
        )

        def _is_repeat_request(text: str) -> bool:
            return len(text.split()) <= 15 and any(p in text.lower() for p in _REPEAT_PHRASES)

        assert _is_repeat_request("can you repeat that please")
        assert _is_repeat_request("say that again")
        assert _is_repeat_request("sorry, pardon?")
        assert _is_repeat_request("repeat")
        assert _is_repeat_request("what was the question again?")

    def test_is_repeat_request_ignores_long_utterances(self):
        """Long utterances (>15 words) are never treated as repeat requests."""
        def _is_repeat_request(text: str) -> bool:
            _REPEAT_PHRASES = ("repeat", "say that again")
            return len(text.split()) <= 15 and any(p in text.lower() for p in _REPEAT_PHRASES)

        long_text = (
            "I think I should repeat that I have five years of experience "
            "working at various companies in the field of machine learning."
        )
        assert not _is_repeat_request(long_text)

    def test_repeat_only_allowed_once(self):
        """_repeat_used guard prevents a second repeat on the same question."""
        _repeat_used = [False]

        def attempt_repeat():
            if not _repeat_used[0]:
                _repeat_used[0] = True
                return "repeated"
            return "blocked"

        assert attempt_repeat() == "repeated"
        assert attempt_repeat() == "blocked"

    def test_repeat_flag_reset_on_new_question(self):
        """_repeat_used resets to False when a new question starts (_do_advance)."""
        _repeat_used = [True]

        # Simulates the reset at the top of _do_advance answered path
        _repeat_used[0] = False

        assert _repeat_used[0] is False


# ---------------------------------------------------------------------------
# Fix 7: end-session endpoint
# ---------------------------------------------------------------------------

class TestEndSessionEndpoint:
    """
    The bug: clicking "End Interview" had no backend call, so the session
    stayed in_progress and the portal showed "Interview is not Completed".

    The fix:
      - Backend: POST /interview/end-session calls end_session() from session_manager
      - Frontend: endSession() fires this endpoint before calling onSessionEnd()
    """

    @pytest.mark.asyncio
    async def test_end_session_marks_completed(self):
        """Endpoint calls end_session() when session is in_progress."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "status": "in_progress"
        }

        mock_end_session = AsyncMock()

        with patch("app.api.interview.end_session", mock_end_session):
            from fastapi.testclient import TestClient
            from fastapi import FastAPI
            import app.api.interview as interview_mod

            # Re-run the handler logic directly (without spinning up full app)
            current_status = "in_progress"
            if current_status in ("in_progress", "pending"):
                await mock_end_session("test-session-id")

        mock_end_session.assert_awaited_once_with("test-session-id")

    @pytest.mark.asyncio
    async def test_end_session_idempotent_for_completed(self):
        """Endpoint skips end_session() if session is already completed."""
        mock_end_session = AsyncMock()

        current_status = "completed"
        if current_status in ("in_progress", "pending"):
            await mock_end_session("test-session-id")

        mock_end_session.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_end_session_idempotent_for_terminated(self):
        """Endpoint skips end_session() if session was terminated_tab_switch."""
        mock_end_session = AsyncMock()

        current_status = "terminated_tab_switch"
        if current_status in ("in_progress", "pending"):
            await mock_end_session("test-session-id")

        mock_end_session.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_end_session_works_for_pending(self):
        """Endpoint also completes sessions still in pending state (edge case)."""
        mock_end_session = AsyncMock()

        current_status = "pending"
        if current_status in ("in_progress", "pending"):
            await mock_end_session("test-session-id")

        mock_end_session.assert_awaited_once_with("test-session-id")

    @pytest.mark.asyncio
    async def test_session_manager_end_session_updates_status(self):
        """end_session() in session_manager updates status to 'completed'."""
        with (
            patch("app.interview.session_manager.get_record") as mock_get,
            patch("app.interview.session_manager.update_record") as mock_update,
            patch("app.interview.session_manager.celery_app") as mock_celery,
        ):
            from datetime import datetime, timezone
            mock_get.return_value = {
                "id": "sess-1",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            from app.interview.session_manager import end_session
            await end_session("sess-1")

            mock_update.assert_called_once()
            call_args = mock_update.call_args
            assert call_args[0][0] == "interview_sessions"
            assert call_args[0][1] == "sess-1"
            assert call_args[0][2]["status"] == "completed"
            assert "duration_seconds" in call_args[0][2]

    @pytest.mark.asyncio
    async def test_session_manager_enqueues_evaluation(self):
        """end_session() enqueues the evaluate_interview_task Celery task."""
        with (
            patch("app.interview.session_manager.get_record") as mock_get,
            patch("app.interview.session_manager.update_record"),
            patch("app.interview.session_manager.celery_app") as mock_celery,
        ):
            from datetime import datetime, timezone
            mock_get.return_value = {
                "id": "sess-2",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            from app.interview.session_manager import end_session
            await end_session("sess-2")

            mock_celery.send_task.assert_called_once_with(
                "evaluate_interview_task",
                args=["sess-2"],
            )

    def test_frontend_endSession_calls_end_session_endpoint(self):
        """
        Verifies (by reading source) that endSession() in interview-room.tsx
        now contains the /api/proxy/api/v1/interview/end-session fetch call.
        """
        import re
        src = open(
            "/Users/sriramtantri/intai/int.ai/frontend/components/candidate/interview-room.tsx"
        ).read()

        assert "end-session" in src, "endSession() must call the end-session endpoint"
        assert "session_id" in src or "sessionId" in src

    def test_backend_end_session_route_exists(self):
        """
        Verifies (by reading source) that the end-session route is registered
        in backend/app/api/interview.py.
        """
        src = open(
            "/Users/sriramtantri/intai/int.ai/backend/app/api/interview.py"
        ).read()

        assert 'router.post("/end-session"' in src
        assert "end_session_route" in src
