"""Embedding service — encode text and compute similarity using sentence-transformers."""

from __future__ import annotations

import logging
import math
from typing import TYPE_CHECKING

from app.services.supabase import update_record

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Lazy singleton for the embedding model
# ---------------------------------------------------------------------------
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    """Load the sentence-transformers model on first use."""
    global _model  # noqa: PLW0603
    if _model is None:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading sentence-transformers model: all-MiniLM-L6-v2")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_text(text: str) -> list[float]:
    """Encode *text* into a 384-dimensional vector and return as a list of floats."""
    model = _get_model()
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def compute_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def store_embedding(application_id: str, embedding: list[float]) -> None:
    """Persist the embedding vector in the resume_data table for the given application."""
    update_record("resume_data", application_id, {"embedding": embedding})
