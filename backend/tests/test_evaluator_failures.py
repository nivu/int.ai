"""Interview grading must fail loudly, never fall back to zero scores, when the model call fails."""

from unittest.mock import MagicMock, patch

import pytest

from app.interview import evaluator


def _failing_client():
    client = MagicMock()
    client.chat.completions.create.side_effect = RuntimeError("model_not_found")
    return client


def test_model_is_not_the_retired_o1_mini():
    assert evaluator._MODEL == "o4-mini"


@pytest.mark.parametrize("call", [evaluator._call_o1, evaluator._call_o1_text])
def test_api_failure_raises(call):
    with (
        patch.object(evaluator, "_get_client", return_value=_failing_client()),
        patch.object(evaluator, "record_usage"),
        pytest.raises(RuntimeError),
    ):
        call("prompt", context="score_q1")


def test_unparseable_reply_still_returns_none():
    client = MagicMock()
    client.chat.completions.create.return_value.choices = [MagicMock(message=MagicMock(content="not json"))]
    with (
        patch.object(evaluator, "_get_client", return_value=client),
        patch.object(evaluator, "record_openai_chat"),
    ):
        assert evaluator._call_o1("prompt", context="score_q1") is None
