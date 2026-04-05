"""Structured logging utility for AI service calls."""

from __future__ import annotations

import json
import logging
from typing import Literal

logger = logging.getLogger("int.ai")


def log_ai_call(
    provider: str,
    model: str,
    operation: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: float,
    status: str,
) -> None:
    """Log an AI provider call as structured JSON.

    Parameters
    ----------
    provider : str
        AI provider name (e.g. "openai").
    model : str
        Model identifier (e.g. "gpt-4o-mini").
    operation : str
        High-level operation name (e.g. "parse_resume", "score_skills").
    input_tokens : int
        Number of prompt / input tokens consumed.
    output_tokens : int
        Number of completion / output tokens produced.
    latency_ms : float
        Wall-clock latency of the call in milliseconds.
    status : str
        Outcome of the call — typically "success" or "error".
    """
    payload = {
        "event": "ai_call",
        "provider": provider,
        "model": model,
        "operation": operation,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "latency_ms": round(latency_ms, 2),
        "status": status,
    }
    logger.info(json.dumps(payload))
