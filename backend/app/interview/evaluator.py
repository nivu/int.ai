"""Interview evaluation engine powered by OpenAI o1-mini.

Scores each Q&A pair on four dimensions, computes an overall grade,
generates an AI narrative summary, and produces the final interview report.

Key constraints (all per spec):
- Model: o1-mini (no system role, no response_format, all prompts in user turn)
- Every prompt ends with the hard JSON-only instruction
- Unconditional fence stripping + try/catch/retry on every parse
- Null answers score 0 and skip the API call
- Weights: technical 0.40, depth 0.30, communication 0.20, relevance 0.10
- Thresholds: >=80 advance, >=55 borderline, <55 reject
"""

from __future__ import annotations

import json
import logging
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from openai import OpenAI

from app.config import settings
from app.services.supabase import get_record, insert_record, supabase, update_record

logger = logging.getLogger("int.ai")

_MODEL = "o1-mini"

DIMENSIONS = [
    "technical_accuracy",
    "depth_of_understanding",
    "communication_clarity",
    "relevance_to_jd",
]

# Spec-mandated weights
_WEIGHTS: dict[str, float] = {
    "technical_accuracy": 0.40,
    "depth_of_understanding": 0.30,
    "communication_clarity": 0.20,
    "relevance_to_jd": 0.10,
}

_JSON_ONLY_INSTRUCTION = (
    "Respond only with a valid JSON object. "
    "No explanation, no markdown, no code fences."
)

_ANTI_LENGTH_BIAS = (
    "A concise correct answer must score higher than a long vague one. "
    "Do not treat length, filler words, or elaboration as indicators of quality. "
    "Score only on correctness, genuine understanding, and relevance to the role."
)


# ---------------------------------------------------------------------------
# OpenAI client
# ---------------------------------------------------------------------------

def _get_client() -> OpenAI:
    return OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())


# ---------------------------------------------------------------------------
# JSON helpers — unconditional fence stripping + retry
# ---------------------------------------------------------------------------

def _strip_fences(text: str) -> str:
    """Remove markdown code fences unconditionally."""
    text = text.strip()
    # Remove opening fence line (```json, ```, etc.)
    text = re.sub(r"^```[a-z]*\n?", "", text)
    # Remove closing fence
    text = re.sub(r"\n?```$", "", text)
    return text.strip()


def _safe_parse(raw: str, context: str) -> dict | None:
    """Strip fences, parse JSON; retry once on failure; return None on second failure."""
    cleaned = _strip_fences(raw)
    for attempt in range(2):
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            if attempt == 0:
                logger.warning(
                    "JSON parse attempt 1 failed for %s: %s — retrying", context, exc
                )
            else:
                logger.error(
                    "JSON parse attempt 2 failed for %s — raw=%r", context, raw
                )
    return None


# ---------------------------------------------------------------------------
# Core LLM call — all content in user role, no response_format
# ---------------------------------------------------------------------------

def _call_o1(prompt: str, context: str) -> dict | None:
    """Send a single user-role message to o1-mini and return parsed JSON or None."""
    client = _get_client()
    start = time.monotonic()
    try:
        response = client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception:
        logger.exception("o1-mini API call failed for %s", context)
        return None

    latency = time.monotonic() - start
    usage = response.usage
    logger.info(
        "o1-mini call [%s]: latency=%.2fs prompt=%s completion=%s",
        context,
        latency,
        usage.prompt_tokens if usage else "?",
        usage.completion_tokens if usage else "?",
    )

    raw = (response.choices[0].message.content or "").strip()
    return _safe_parse(raw, context)


def _call_o1_text(prompt: str, context: str) -> str:
    """Send a single user-role message to o1-mini and return raw text."""
    client = _get_client()
    start = time.monotonic()
    try:
        response = client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception:
        logger.exception("o1-mini text call failed for %s", context)
        return ""

    latency = time.monotonic() - start
    logger.info("o1-mini text call [%s]: latency=%.2fs", context, latency)
    return (response.choices[0].message.content or "").strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_interview(session_id: str) -> dict[str, Any]:
    """Evaluate a completed interview session and produce an interview report."""
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

    application = get_record("applications", application_id)
    hiring_post = get_record("hiring_posts", application["hiring_post_id"])
    jd_text: str = hiring_post.get("description", "")

    # ── Per-question scoring ────────────────────────────────────────────────
    all_scores: list[dict[str, Any]] = []
    for qa in qa_items:
        answer = (qa.get("answer_text") or "").strip()
        if not answer:
            # Skipped — score 0, no API call
            null_reasoning = {dim: "No response given" for dim in DIMENSIONS}
            scores: dict[str, Any] = {
                **{dim: 0 for dim in DIMENSIONS},
                "per_dimension_reasoning": null_reasoning,
                "score_rationale": "No response — timer expired",
            }
        else:
            scores = _score_qa_pair(
                question=qa.get("question_text", ""),
                answer=answer,
                jd_text=jd_text,
                question_number=qa.get("question_number", 0),
            )

        all_scores.append(scores)

        # Persist scores back to interview_qa
        try:
            update_record("interview_qa", qa["id"], {
                "technical_accuracy": scores["technical_accuracy"],
                "depth_of_understanding": scores["depth_of_understanding"],
                "communication_clarity": scores["communication_clarity"],
                "relevance_to_jd": scores["relevance_to_jd"],
                "score_rationale": scores["score_rationale"],
                "per_dimension_reasoning": scores["per_dimension_reasoning"],
            })
        except Exception:
            logger.exception("Failed to persist scores for qa=%s", qa["id"])

    # ── Overall grade calculation (code, not LLM) ──────────────────────────
    # question_score = sum(dim * weight for dim in DIMENSIONS)
    # overall_score = avg(question_scores) * 10  (scale 0-10 → 0-100)
    question_scores = [
        sum(s[dim] * _WEIGHTS[dim] for dim in DIMENSIONS)
        for s in all_scores
    ]
    raw_avg = sum(question_scores) / len(question_scores) if question_scores else 0.0
    overall_grade = round(raw_avg * 10, 2)
    overall_grade = max(0.0, min(100.0, overall_grade))

    # Per-spec thresholds
    if overall_grade >= 80:
        recommendation = "advance"
    elif overall_grade >= 55:
        recommendation = "borderline"
    else:
        recommendation = "reject"

    # Dimension averages for radar chart
    dimension_averages = {
        dim: round(sum(s[dim] for s in all_scores) / len(all_scores), 2)
        for dim in DIMENSIONS
    }

    # ── Synthesis call ─────────────────────────────────────────────────────
    summary_data = _generate_synthesis(
        qa_items=qa_items,
        all_scores=all_scores,
        overall_grade=overall_grade,
        recommendation=recommendation,
        jd_text=jd_text,
    )

    # ── Candidate email generation ─────────────────────────────────────────
    candidate_email_body = _generate_candidate_email(
        summary=summary_data.get("summary", ""),
        strengths=summary_data.get("strengths", []),
        concerns=summary_data.get("concerns", []),
        jd_text=jd_text,
    )

    # ── Persist report ─────────────────────────────────────────────────────
    share_token = secrets.token_urlsafe(24)[:32]
    share_expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    report_data: dict[str, Any] = {
        "session_id": session_id,
        "overall_grade": overall_grade,
        "recommendation": recommendation,
        "summary": summary_data.get("summary", ""),
        "strengths": summary_data.get("strengths", []),
        "concerns": summary_data.get("concerns", []),
        "dimension_averages": dimension_averages,
        "candidate_email_body": candidate_email_body,
        "share_token": share_token,
        "share_expires_at": share_expires_at,
    }
    report = insert_record("interview_reports", report_data)

    logger.info(
        "Report created session=%s grade=%.1f recommendation=%s",
        session_id, overall_grade, recommendation,
    )
    return report


# ---------------------------------------------------------------------------
# Scoring prompt — one call per non-null question
# ---------------------------------------------------------------------------

def _score_qa_pair(
    question: str,
    answer: str,
    jd_text: str,
    question_number: int,
) -> dict[str, Any]:
    """Call o1-mini to score a single Q&A pair. Returns scores + per_dimension_reasoning."""
    prompt = f"""\
You are an expert technical interview evaluator. Score the candidate's answer \
to the interview question below on four dimensions, each on a scale of 0 to 10 \
(integers only).

{_ANTI_LENGTH_BIAS}

o1-mini has no memory between calls. The full rubric is included here:

## Dimensions
- technical_accuracy (0-10): Is the answer factually and technically correct?
- depth_of_understanding (0-10): Does the candidate show genuine understanding \
of the concept, not just surface recall?
- communication_clarity (0-10): Is the answer expressed clearly, concisely, \
and without ambiguity?
- relevance_to_jd (0-10): Does the answer demonstrate skills and knowledge \
relevant to the job description?

## Weights (for your reference, but do NOT compute scores in your output)
technical_accuracy × 0.40, depth_of_understanding × 0.30, \
communication_clarity × 0.20, relevance_to_jd × 0.10

## Job Description
{jd_text}

## Question {question_number}
{question}

## Candidate's Answer
{answer}

## Required JSON Shape
{{
  "technical_accuracy": <integer 0-10>,
  "depth_of_understanding": <integer 0-10>,
  "communication_clarity": <integer 0-10>,
  "relevance_to_jd": <integer 0-10>,
  "per_dimension_reasoning": {{
    "technical_accuracy": "<one sentence>",
    "depth_of_understanding": "<one sentence>",
    "communication_clarity": "<one sentence>",
    "relevance_to_jd": "<one sentence>"
  }}
}}

{_JSON_ONLY_INSTRUCTION}"""

    result = _call_o1(prompt, context=f"score_q{question_number}")
    if result is None:
        # Parse failure fallback — null scores for this question
        logger.error("Scoring failed for q%d — using null scores", question_number)
        null_reasoning = {dim: "Scoring unavailable" for dim in DIMENSIONS}
        return {
            **{dim: 0 for dim in DIMENSIONS},
            "per_dimension_reasoning": null_reasoning,
            "score_rationale": "Scoring unavailable",
        }

    clamped = {dim: _clamp(result.get(dim, 0)) for dim in DIMENSIONS}
    per_dim = result.get("per_dimension_reasoning", {})
    if not isinstance(per_dim, dict):
        per_dim = {}
    for dim in DIMENSIONS:
        if dim not in per_dim or not isinstance(per_dim[dim], str):
            per_dim[dim] = ""

    rationale_parts = [f"{dim}: {per_dim[dim]}" for dim in DIMENSIONS if per_dim.get(dim)]
    score_rationale = " | ".join(rationale_parts)

    return {
        **clamped,
        "per_dimension_reasoning": per_dim,
        "score_rationale": score_rationale,
    }


# ---------------------------------------------------------------------------
# Synthesis prompt — one call after all questions are scored
# ---------------------------------------------------------------------------

def _generate_synthesis(
    qa_items: list[dict[str, Any]],
    all_scores: list[dict[str, Any]],
    overall_grade: float,
    recommendation: str,
    jd_text: str,
) -> dict[str, Any]:
    """Call o1-mini to produce the narrative summary, strengths, and concerns."""
    qa_block = "\n\n".join(
        f"Q{i + 1}: {qa.get('question_text', '')}\n"
        f"Candidate Answer: {qa.get('answer_text', '') or '[No response]'}\n"
        f"Scores — technical: {s['technical_accuracy']}/10, "
        f"depth: {s['depth_of_understanding']}/10, "
        f"communication: {s['communication_clarity']}/10, "
        f"relevance: {s['relevance_to_jd']}/10\n"
        f"Reasoning: {s.get('score_rationale', '')}"
        for i, (qa, s) in enumerate(zip(qa_items, all_scores))
    )

    band = {"advance": "Strong Pass", "borderline": "Borderline", "reject": "Reject"}.get(
        recommendation, recommendation
    )

    prompt = f"""\
You are an expert technical interview evaluator writing a hiring report for a recruiter.

## Job Description
{jd_text}

## Interview Q&A with Scores
{qa_block}

## Overall Score
{overall_grade:.1f} / 100 — Band: {band}

## Instructions
Write a concise but informative report. Follow these rules exactly:
- The summary must be 2–3 sentences of narrative. Do NOT repeat numeric scores.
- Strengths must reference what the candidate actually said, not generic praise.
- Concerns must reference what the candidate actually said, not generic criticism.
- Provide 2–4 specific strengths grounded in actual answers.
- Provide 2–4 specific concerns grounded in actual answers.
- If a question was skipped (no response), note that as a concern if relevant.

## Required JSON Shape
{{
  "summary": "<2-3 sentence narrative>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", ...],
  "concerns": ["<specific concern 1>", "<specific concern 2>", ...]
}}

{_JSON_ONLY_INSTRUCTION}"""

    result = _call_o1(prompt, context="synthesis")
    if result is None:
        logger.error("Synthesis call failed — using empty fallback")
        return {"summary": "", "strengths": [], "concerns": []}

    return {
        "summary": result.get("summary", ""),
        "strengths": result.get("strengths", []) if isinstance(result.get("strengths"), list) else [],
        "concerns": result.get("concerns", []) if isinstance(result.get("concerns"), list) else [],
    }


# ---------------------------------------------------------------------------
# Candidate email generation
# ---------------------------------------------------------------------------

def _generate_candidate_email(
    summary: str,
    strengths: list[str],
    concerns: list[str],
    jd_text: str,
) -> str:
    """Call o1-mini to produce the candidate-facing post-interview email body.

    Returns plain text. No numeric scores, no band decision.
    """
    strengths_text = "\n".join(f"- {s}" for s in strengths) if strengths else "(none noted)"
    concerns_text = "\n".join(f"- {c}" for c in concerns) if concerns else "(none noted)"

    prompt = f"""\
You are writing a post-interview follow-up email to a candidate on behalf of a \
hiring team. This email is sent after the candidate completes an AI voice interview.

## Interview Summary (internal, do not quote directly)
{summary}

## Strengths observed
{strengths_text}

## Areas for development
{concerns_text}

## Job Description context
{jd_text}

## Instructions
Write a warm, professional email body (no subject line, no "Hi [Name]" — just the body \
paragraphs). Follow these rules exactly:
- Include a brief acknowledgement of the candidate completing the interview.
- Frame 2–3 observed strengths constructively (what they demonstrated well).
- Frame 2–3 concerns as areas to develop, not as failures.
- Do NOT include any numeric scores.
- Do NOT reveal the hiring band decision (advance / borderline / reject).
- Keep tone warm and encouraging but professional.
- End with a statement that the team will be in touch.
- Plain text only, no markdown, no bullet points, no headers. Just paragraphs."""

    body = _call_o1_text(prompt, context="candidate_email")
    if not body:
        logger.error("Candidate email generation failed — using empty fallback")
    return body


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clamp(value: Any) -> int:
    try:
        return max(0, min(10, int(value)))
    except (TypeError, ValueError):
        return 0
