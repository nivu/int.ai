"""Embedding service — encode text and compute similarity using OpenAI embeddings API."""

from __future__ import annotations

import logging
import math

from openai import OpenAI

from app.config import settings
from app.services.supabase import update_record

logger = logging.getLogger("int.ai")

# OpenAI text-embedding-3-small: 1536 dimensions, $0.02/M tokens
_MODEL = "text-embedding-3-small"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_text(text: str) -> list[float]:
    """Encode text into a vector using OpenAI embeddings API."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())

    # Truncate to ~8000 tokens worth of text to stay within limits
    truncated = text[:32000]

    response = client.embeddings.create(
        model=_MODEL,
        input=truncated,
    )

    embedding = response.data[0].embedding
    logger.info(
        "embed_text: model=%s dimensions=%d tokens=%d",
        _MODEL,
        len(embedding),
        response.usage.total_tokens,
    )
    return embedding


def compute_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def store_embedding(record_id: str, embedding: list[float]) -> None:
    """Persist the embedding vector in the resume_data table."""
    update_record("resume_data", record_id, {"embedding": embedding})
