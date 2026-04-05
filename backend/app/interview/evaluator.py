"""Interview evaluation engine powered by Gemini.

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

from google import genai
from google.genai import types

from app.config import settings
from app.services.supabase import get_record, insert_record, supabase, update_record

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Gemini client
# ---------------------------------------------------------------------------
_client = genai.Client(api_key=settings.GEMINI_API_KEY.get_secret_value())
_MODEL = "gemini-2.0-flash"

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


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_interview(session_id: str) -> dict[str, Any]:
    """Evaluate a completed interview session and produce an interview report.

    Parameters
    ----------
    session_id:
        UUID of the interview_session record.

    Returns
    -------
    dict
        The created ``interview_report`` record.
    """
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
            answer=qa.get("answer_transcript", ""),
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

    # Weighted sum of dimension averages (each 0-10), then scale to 0-100
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
        "application_id": application_id,
        "overall_grade": overall_grade,
        "dimension_averages": dimension_averages,
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

    # 8. Return the report
    return report


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _evaluate_qa_pair(
    question: str,
    answer: str,
    jd_text: str,
) -> dict[str, Any]:
    """Call Gemini to score a single Q&A pair on all four dimensions."""
    prompt = (
        "You are an expert technical interview evaluator.\n\n"
        "## Job Description\n"
        f"{jd_text}\n\n"
        "## Question\n"
        f"{question}\n\n"
        "## Candidate Answer\n"
        f"{answer}\n\n"
        "## Instructions\n"
        "Evaluate the candidate's answer on these four dimensions, "
        "each scored from 0 to 10 (integers only):\n"
        "1. technical_accuracy - correctness and precision of technical content\n"
        "2. depth_of_understanding - how deeply the candidate understands the topic\n"
        "3. communication_clarity - how clearly the answer is expressed\n"
        "4. relevance_to_jd - how relevant the answer is to the job requirements\n\n"
        "Also provide a brief score_rationale (1-2 sentences) explaining the scores.\n\n"
        "Respond with ONLY a JSON object with keys: "
        "technical_accuracy, depth_of_understanding, communication_clarity, "
        "relevance_to_jd (all integers 0-10), and score_rationale (string)."
    )

    start = time.monotonic()
    try:
        response = _client.models.generate_content(
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )
        latency = time.monotonic() - start

        result = json.loads(response.text)

        # Log token usage and latency
        usage = getattr(response, "usage_metadata", None)
        if usage:
            logger.info(
                "QA evaluation: latency=%.2fs prompt_tokens=%s candidates_tokens=%s",
                latency,
                getattr(usage, "prompt_token_count", "N/A"),
                getattr(usage, "candidates_token_count", "N/A"),
            )
        else:
            logger.info("QA evaluation: latency=%.2fs", latency)

        return {
            "technical_accuracy": _clamp_score(result.get("technical_accuracy", 0)),
            "depth_of_understanding": _clamp_score(result.get("depth_of_understanding", 0)),
            "communication_clarity": _clamp_score(result.get("communication_clarity", 0)),
            "relevance_to_jd": _clamp_score(result.get("relevance_to_jd", 0)),
            "score_rationale": result.get("score_rationale", ""),
        }

    except Exception:
        logger.exception("Failed to evaluate Q&A pair via Gemini")
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
        f"A{i+1}: {qa.get('answer_transcript', '')}\n"
        f"Scores: tech={scores['technical_accuracy']}, depth={scores['depth_of_understanding']}, "
        f"comm={scores['communication_clarity']}, relevance={scores['relevance_to_jd']}\n"
        f"Rationale: {scores.get('score_rationale', '')}"
        for i, (qa, scores) in enumerate(zip(qa_items, all_scores))
    )

    prompt = (
        "You are an expert technical interview evaluator writing a report for a recruiter.\n\n"
        f"## Job Description\n{jd_text}\n\n"
        f"## Interview Q&A with Scores\n{qa_block}\n\n"
        f"## Overall Grade: {overall_grade}/100\n\n"
        "## Instructions\n"
        "Produce a JSON object with:\n"
        '- "summary": a 3-5 sentence narrative covering the candidate\'s strengths, '
        "concerns, and overall fit for the role.\n"
        '- "strengths": an array of 2-4 short bullet strings highlighting key strengths.\n'
        '- "concerns": an array of 1-3 short bullet strings highlighting concerns or gaps.\n\n'
        "Respond with ONLY the JSON object."
    )

    start = time.monotonic()
    try:
        response = _client.models.generate_content(
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.4,
                response_mime_type="application/json",
            ),
        )
        latency = time.monotonic() - start

        result = json.loads(response.text)

        usage = getattr(response, "usage_metadata", None)
        if usage:
            logger.info(
                "Summary generation: latency=%.2fs prompt_tokens=%s candidates_tokens=%s",
                latency,
                getattr(usage, "prompt_token_count", "N/A"),
                getattr(usage, "candidates_token_count", "N/A"),
            )
        else:
            logger.info("Summary generation: latency=%.2fs", latency)

        return {
            "summary": result.get("summary", ""),
            "strengths": result.get("strengths", []),
            "concerns": result.get("concerns", []),
        }

    except Exception:
        logger.exception("Failed to generate interview summary via Gemini")
        raise


def _clamp_score(value: Any) -> int:
    """Clamp a score value to [0, 10] integer range."""
    try:
        return max(0, min(10, int(value)))
    except (TypeError, ValueError):
        return 0
