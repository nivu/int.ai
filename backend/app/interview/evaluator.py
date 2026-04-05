"""Interview evaluation engine powered by OpenAI GPT-4o mini.

Scores each Q&A pair on four dimensions, computes an overall grade,
generates an AI narrative summary, and produces the final interview report.
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from openai import OpenAI

from app.config import settings
from app.services.supabase import get_record, insert_record, supabase, update_record

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# OpenAI client
# ---------------------------------------------------------------------------
_MODEL = "gpt-4o-mini"

# ---------------------------------------------------------------------------
# Scoring dimensions and defaults
# ---------------------------------------------------------------------------
DIMENSIONS = [
    "technical_accuracy",
    "depth_of_understanding",
    "communication_clarity",
    "relevance_to_jd",
]

DEFAULT_WEIGHTS: dict[str, float] = {
    "technical_accuracy": 0.35,
    "depth_of_understanding": 0.25,
    "communication_clarity": 0.20,
    "relevance_to_jd": 0.20,
}


def _openai_json_request(system_prompt: str, user_content: str, temperature: float = 0.2) -> dict:
    """Send a request to OpenAI requesting JSON output and return parsed dict."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())

    start = time.monotonic()
    response = client.chat.completions.create(
        model=_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=temperature,
    )
    latency = time.monotonic() - start

    usage = response.usage
    logger.info(
        "OpenAI eval call: latency=%.2fs prompt_tokens=%s completion_tokens=%s",
        latency,
        usage.prompt_tokens if usage else None,
        usage.completion_tokens if usage else None,
    )

    return json.loads(response.choices[0].message.content)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_interview(session_id: str) -> dict[str, Any]:
    """Evaluate a completed interview session and produce an interview report."""
    # 1. Fetch session and Q&A records
    session = get_record("interview_sessions", session_id)
    application_id: str = session["application_id"]

    qa_response = (
        supabase.table("interview_qa")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    qa_items: list[dict[str, Any]] = qa_response.data or []

    if not qa_items:
        raise ValueError(f"No Q&A records found for session {session_id}")

    # Fetch hiring post for JD context and scoring weights
    application = get_record("applications", application_id)
    hiring_post = get_record("hiring_posts", application["hiring_post_id"])
    jd_text: str = hiring_post.get("description", "")
    scoring_weights: dict[str, float] = hiring_post.get("scoring_weights") or DEFAULT_WEIGHTS

    # Normalise weights to the four dimensions
    weights = {dim: scoring_weights.get(dim, DEFAULT_WEIGHTS[dim]) for dim in DIMENSIONS}
    total_weight = sum(weights.values()) or 1.0
    weights = {k: v / total_weight for k, v in weights.items()}

    # 2 & 3. Evaluate each Q&A pair
    all_scores: list[dict[str, float]] = []
    for qa in qa_items:
        scores = _evaluate_qa_pair(
            question=qa.get("question_text", ""),
            answer=qa.get("answer_text", ""),
            jd_text=jd_text,
        )
        all_scores.append(scores)

        # Update the interview_qa record with scores
        update_record("interview_qa", qa["id"], {
            "technical_accuracy": scores["technical_accuracy"],
            "depth_of_understanding": scores["depth_of_understanding"],
            "communication_clarity": scores["communication_clarity"],
            "relevance_to_jd": scores["relevance_to_jd"],
            "score_rationale": scores["score_rationale"],
        })

    # 4. Compute overall grade (weighted aggregate, normalised to 0-100)
    dimension_averages: dict[str, float] = {}
    for dim in DIMENSIONS:
        dim_scores = [s[dim] for s in all_scores]
        dimension_averages[dim] = sum(dim_scores) / len(dim_scores) if dim_scores else 0.0

    weighted_sum = sum(dimension_averages[dim] * weights[dim] for dim in DIMENSIONS)
    overall_grade = round(weighted_sum * 10, 2)  # 0-10 -> 0-100
    overall_grade = max(0.0, min(100.0, overall_grade))

    # 5. Generate AI summary
    summary_data = _generate_summary(
        qa_items=qa_items,
        all_scores=all_scores,
        overall_grade=overall_grade,
        jd_text=jd_text,
    )

    # 6. Determine recommendation
    if overall_grade >= 70:
        recommendation = "advance"
    elif overall_grade >= 60:
        recommendation = "borderline"
    else:
        recommendation = "reject"

    # 7. Create interview_report record
    share_token = secrets.token_urlsafe(24)[:32]
    share_expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    report_data: dict[str, Any] = {
        "session_id": session_id,
        "overall_grade": overall_grade,
        "recommendation": recommendation,
        "summary": summary_data["summary"],
        "strengths": summary_data["strengths"],
        "concerns": summary_data["concerns"],
        "share_token": share_token,
        "share_expires_at": share_expires_at,
    }
    report = insert_record("interview_reports", report_data)

    logger.info(
        "Interview report created for session=%s grade=%.1f recommendation=%s",
        session_id,
        overall_grade,
        recommendation,
    )

    return report


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _evaluate_qa_pair(question: str, answer: str, jd_text: str) -> dict[str, Any]:
    """Call OpenAI to score a single Q&A pair on all four dimensions."""
    system_prompt = (
        "You are an expert technical interview evaluator. "
        "Evaluate the candidate's answer on four dimensions, each scored 0-10 (integers). "
        "Also provide a brief score_rationale (1-2 sentences). "
        "Respond with ONLY a JSON object with keys: "
        "technical_accuracy, depth_of_understanding, communication_clarity, "
        "relevance_to_jd (all integers 0-10), and score_rationale (string)."
    )

    user_content = (
        f"## Job Description\n{jd_text}\n\n"
        f"## Question\n{question}\n\n"
        f"## Candidate Answer\n{answer}"
    )

    try:
        result = _openai_json_request(system_prompt, user_content, temperature=0.2)
        return {
            "technical_accuracy": _clamp_score(result.get("technical_accuracy", 0)),
            "depth_of_understanding": _clamp_score(result.get("depth_of_understanding", 0)),
            "communication_clarity": _clamp_score(result.get("communication_clarity", 0)),
            "relevance_to_jd": _clamp_score(result.get("relevance_to_jd", 0)),
            "score_rationale": result.get("score_rationale", ""),
        }
    except Exception:
        logger.exception("Failed to evaluate Q&A pair via OpenAI")
        raise


def _generate_summary(
    qa_items: list[dict[str, Any]],
    all_scores: list[dict[str, Any]],
    overall_grade: float,
    jd_text: str,
) -> dict[str, Any]:
    """Generate an AI narrative summary of the interview performance."""
    qa_block = "\n\n".join(
        f"Q{i+1}: {qa.get('question_text', '')}\n"
        f"A{i+1}: {qa.get('answer_text', '')}\n"
        f"Scores: tech={scores['technical_accuracy']}, depth={scores['depth_of_understanding']}, "
        f"comm={scores['communication_clarity']}, relevance={scores['relevance_to_jd']}\n"
        f"Rationale: {scores.get('score_rationale', '')}"
        for i, (qa, scores) in enumerate(zip(qa_items, all_scores))
    )

    system_prompt = (
        "You are an expert technical interview evaluator writing a report for a recruiter. "
        "Produce a JSON object with: "
        '"summary" (3-5 sentence narrative), '
        '"strengths" (array of 2-4 bullet strings), '
        '"concerns" (array of 1-3 bullet strings). '
        "Respond with ONLY the JSON object."
    )

    user_content = (
        f"## Job Description\n{jd_text}\n\n"
        f"## Interview Q&A with Scores\n{qa_block}\n\n"
        f"## Overall Grade: {overall_grade}/100"
    )

    try:
        return _openai_json_request(system_prompt, user_content, temperature=0.4)
    except Exception:
        logger.exception("Failed to generate interview summary via OpenAI")
        raise


def _clamp_score(value: Any) -> int:
    """Clamp a score value to [0, 10] integer range."""
    try:
        return max(0, min(10, int(value)))
    except (TypeError, ValueError):
        return 0
