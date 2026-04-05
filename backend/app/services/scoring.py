"""Scoring service — compute resume-to-JD match scores via embeddings and OpenAI."""

from __future__ import annotations

import json
import logging
import time

from openai import OpenAI

from app.config import settings
from app.services.embeddings import compute_similarity, embed_text

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _llm_json_request(system_prompt: str, user_content: str) -> dict:
    """Send a request to OpenAI requesting JSON output and return parsed dict."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())

    start = time.time()
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    latency = time.time() - start

    usage = response.usage
    logger.info(
        "OpenAI scoring call: latency=%.2fs prompt_tokens=%s completion_tokens=%s",
        latency,
        usage.prompt_tokens if usage else None,
        usage.completion_tokens if usage else None,
    )

    return json.loads(response.choices[0].message.content)


# ---------------------------------------------------------------------------
# Embedding similarity
# ---------------------------------------------------------------------------

def score_embedding_similarity(resume_text: str, jd_text: str) -> float:
    """Embed resume and JD texts and return their cosine similarity (0.0-1.0)."""
    vec_resume = embed_text(resume_text)
    vec_jd = embed_text(jd_text)
    similarity = compute_similarity(vec_resume, vec_jd)
    # Clamp to [0, 1]
    return max(0.0, min(1.0, similarity))


# ---------------------------------------------------------------------------
# Skill match (LLM)
# ---------------------------------------------------------------------------

SKILL_MATCH_SYSTEM_PROMPT = """\
You are an expert technical recruiter. Given a resume and a list of required \
skills, evaluate whether the candidate demonstrates each skill.

Return **only** valid JSON (no markdown fences) in this format:
{
  "skills": [
    {
      "skill": "string — the required skill",
      "matched": true/false,
      "confidence": 0.0-1.0,
      "evidence": "string — brief quote or explanation from the resume"
    }
  ]
}

Rules:
- Evaluate each skill independently.
- confidence should reflect how strongly the resume demonstrates the skill.
- If a skill is not found at all, set matched=false, confidence=0.0, evidence="Not found".
"""


def score_skill_match(
    resume_text: str,
    jd_skills: list[str],
) -> tuple[float, dict]:
    """Evaluate each required skill against resume evidence using OpenAI.

    Returns (aggregate_score, details_dict).
    """
    if not jd_skills:
        return 0.0, {"skills": []}

    user_content = (
        f"## Required Skills\n{json.dumps(jd_skills)}\n\n"
        f"## Resume\n{resume_text}"
    )
    details = _llm_json_request(SKILL_MATCH_SYSTEM_PROMPT, user_content)

    skills_list = details.get("skills", [])
    if not skills_list:
        return 0.0, details

    total_confidence = sum(s.get("confidence", 0.0) for s in skills_list)
    aggregate = total_confidence / len(skills_list)
    return max(0.0, min(1.0, aggregate)), details


# ---------------------------------------------------------------------------
# Experience match (LLM)
# ---------------------------------------------------------------------------

EXPERIENCE_MATCH_SYSTEM_PROMPT = """\
You are an expert technical recruiter. Compare the candidate's resume against \
the job description and evaluate experience alignment.

Return **only** valid JSON (no markdown fences):
{
  "seniority_alignment": {"score": 0.0-1.0, "reasoning": "string"},
  "years_of_experience": {"score": 0.0-1.0, "reasoning": "string"},
  "project_complexity": {"score": 0.0-1.0, "reasoning": "string"},
  "domain_relevance": {"score": 0.0-1.0, "reasoning": "string"},
  "overall": 0.0-1.0
}
"""


def score_experience_match(
    resume_text: str,
    jd_text: str,
) -> tuple[float, dict]:
    """Evaluate experience alignment using OpenAI. Returns (score, details)."""
    user_content = (
        f"## Job Description\n{jd_text}\n\n"
        f"## Resume\n{resume_text}"
    )
    details = _llm_json_request(EXPERIENCE_MATCH_SYSTEM_PROMPT, user_content)
    score = float(details.get("overall", 0.0))
    return max(0.0, min(1.0, score)), details


# ---------------------------------------------------------------------------
# Culture match (LLM)
# ---------------------------------------------------------------------------

CULTURE_MATCH_SYSTEM_PROMPT = """\
You are an expert talent analyst. Based on the candidate's resume and the job \
description, infer culture-fit signals.

Return **only** valid JSON (no markdown fences):
{
  "collaboration_signals": {"score": 0.0-1.0, "reasoning": "string"},
  "communication_style": {"score": 0.0-1.0, "reasoning": "string"},
  "initiative_indicators": {"score": 0.0-1.0, "reasoning": "string"},
  "overall": 0.0-1.0
}
"""


def score_culture_match(
    resume_text: str,
    jd_text: str,
) -> tuple[float, dict]:
    """Infer culture-fit signals using OpenAI. Returns (score, details)."""
    user_content = (
        f"## Job Description\n{jd_text}\n\n"
        f"## Resume\n{resume_text}"
    )
    details = _llm_json_request(CULTURE_MATCH_SYSTEM_PROMPT, user_content)
    score = float(details.get("overall", 0.0))
    return max(0.0, min(1.0, score)), details


# ---------------------------------------------------------------------------
# Weighted aggregate
# ---------------------------------------------------------------------------

DEFAULT_WEIGHTS = {
    "embedding_similarity": 0.20,
    "skill_match": 0.35,
    "experience_match": 0.25,
    "culture_match": 0.20,
}


def compute_overall_score(scores: dict, weights: dict | None = None) -> float:
    """Compute weighted aggregate of the four scoring dimensions.

    *scores* should have keys: embedding_similarity, skill_match,
    experience_match, culture_match — each a float 0.0-1.0.

    *weights* should have the same keys mapping to float weights.
    Falls back to DEFAULT_WEIGHTS for any missing key.
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    total_weight = sum(w.get(k, 0.0) for k in scores)
    if total_weight == 0:
        return 0.0
    weighted_sum = sum(scores[k] * w.get(k, 0.0) for k in scores)
    return max(0.0, min(1.0, weighted_sum / total_weight))
