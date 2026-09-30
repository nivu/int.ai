"""AI/voice usage recording — one ``ai_usage`` row per billable call.

Two halves:

* ``usage_context(...)`` — a ``contextvars`` scope carrying the org / job /
  application / session IDs, set once at the top of a screening task, an
  interview session, or an admin request. Every ``record_usage`` call inside
  picks the IDs up automatically, so call sites only report what they used.
* ``record_usage(...)`` — computes an estimated ``cost_usd`` from ``PRICING``
  and inserts the row. Never raises: usage tracking must not break the
  operation it observes.

Prices are list prices in USD as of 2026-09 and are deliberately kept here,
in one place, so they can be corrected without touching call sites.
"""

from __future__ import annotations

import contextvars
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Price table (USD). Keys: (provider, model).
#   per_1m_input / per_1m_output : per million tokens
#   per_minute                   : per minute of audio or session time
#   per_1k_chars                 : per thousand characters synthesised
# ---------------------------------------------------------------------------
PRICING: dict[tuple[str, str], dict[str, float]] = {
    ("openai", "gpt-4o-mini"): {"per_1m_input": 0.15, "per_1m_output": 0.60},
    ("openai", "o1-mini"): {"per_1m_input": 1.10, "per_1m_output": 4.40},
    ("openai", "text-embedding-3-small"): {"per_1m_input": 0.02, "per_1m_output": 0.0},
    ("deepgram", "nova-2"): {"per_minute": 0.0043},
    ("deepgram", "aura-luna-en"): {"per_1k_chars": 0.030},
    ("deepgram", "aura-asteria-en"): {"per_1k_chars": 0.030},
    ("livekit", "agent-session"): {"per_minute": 0.01},
}


def estimate_cost(
    provider: str,
    model: str,
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    duration_seconds: float = 0.0,
    characters: int = 0,
) -> float:
    price = PRICING.get((provider, model))
    if not price:
        return 0.0
    cost = 0.0
    cost += input_tokens / 1_000_000 * price.get("per_1m_input", 0.0)
    cost += output_tokens / 1_000_000 * price.get("per_1m_output", 0.0)
    cost += duration_seconds / 60 * price.get("per_minute", 0.0)
    cost += characters / 1000 * price.get("per_1k_chars", 0.0)
    return round(cost, 6)


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------
_CONTEXT_KEYS = ("org_id", "hiring_post_id", "application_id", "interview_session_id")
_usage_ctx: contextvars.ContextVar[dict[str, str | None]] = contextvars.ContextVar("ai_usage_ctx", default={})


def set_usage_context(**ids: str | None) -> contextvars.Token:
    """Set IDs for subsequent ``record_usage`` calls in this task/coroutine."""
    merged = {**_usage_ctx.get(), **{k: v for k, v in ids.items() if k in _CONTEXT_KEYS}}
    return _usage_ctx.set(merged)


@contextmanager
def usage_context(**ids: str | None) -> Iterator[None]:
    token = set_usage_context(**ids)
    try:
        yield
    finally:
        _usage_ctx.reset(token)


def current_usage_context() -> dict[str, str | None]:
    return dict(_usage_ctx.get())


def reset_usage_context(token: contextvars.Token) -> None:
    _usage_ctx.reset(token)


# ---------------------------------------------------------------------------
# Recording
# ---------------------------------------------------------------------------
def record_usage(
    provider: str,
    model: str,
    operation: str,
    *,
    input_tokens: int | None = 0,
    output_tokens: int | None = 0,
    duration_seconds: float | None = 0.0,
    characters: int | None = 0,
    latency_ms: float | None = None,
    status: str = "success",
    error: str | None = None,
    **ids: str | None,
) -> None:
    """Insert one ``ai_usage`` row. Best-effort; logs and swallows failures.

    Explicit ``ids`` (org_id, hiring_post_id, application_id,
    interview_session_id) override the ambient context.
    """
    try:
        from app.services.supabase import supabase as sb

        ctx = {**_usage_ctx.get(), **{k: v for k, v in ids.items() if k in _CONTEXT_KEYS and v}}
        row: dict[str, Any] = {
            "provider": provider,
            "model": model,
            "operation": operation,
            "input_tokens": int(input_tokens or 0),
            "output_tokens": int(output_tokens or 0),
            "duration_seconds": float(duration_seconds or 0.0),
            "characters": int(characters or 0),
            "cost_usd": estimate_cost(
                provider,
                model,
                input_tokens=int(input_tokens or 0),
                output_tokens=int(output_tokens or 0),
                duration_seconds=float(duration_seconds or 0.0),
                characters=int(characters or 0),
            ),
            "latency_ms": round(latency_ms, 2) if latency_ms is not None else None,
            "status": status,
            "error": (error or None) and str(error)[:500],
            **{k: v for k, v in ctx.items() if v},
        }
        sb.table("ai_usage").insert(row).execute()
        logger.info(
            '{"event": "ai_usage", "provider": "%s", "model": "%s", "operation": "%s", '
            '"cost_usd": %s, "status": "%s"}',
            provider, model, operation, row["cost_usd"], status,
        )
    except Exception:
        logger.exception("record_usage failed for %s/%s/%s", provider, model, operation)


def record_openai_chat(response: Any, operation: str, *, latency_ms: float | None = None, **ids: str | None) -> None:
    """Convenience: record a chat.completions response (uses response.model + usage)."""
    usage = getattr(response, "usage", None)
    record_usage(
        "openai",
        _normalise_model(getattr(response, "model", "") or ""),
        operation,
        input_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
        output_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
        latency_ms=latency_ms,
        **ids,
    )


def _normalise_model(model: str) -> str:
    """OpenAI returns dated snapshots (gpt-4o-mini-2024-07-18); price by family."""
    for family in ("gpt-4o-mini", "o1-mini", "text-embedding-3-small"):
        if model.startswith(family):
            return family
    return model
