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
skills, evaluate whether the candidate demonstrates each skill — either \
explicitly (mentioned by name) or implicitly (demonstrated through tools, \
frameworks, or projects that require that skill).

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
- STRONG implicit inference is required — do not penalise candidates for not \
spelling out fundamentals that are obviously demonstrated:
  - Any Python project, script, or ML work → data types and basic data structures \
are prerequisite knowledge. Confidence >= 0.85.
  - Any Python framework (Django, Flask, FastAPI, SQLAlchemy, PyTorch, TensorFlow, \
Keras, scikit-learn) → OOP is required to use them. Confidence >= 0.85.
  - Git mentioned, or any collaborative/team/open-source work → version control. \
Confidence >= 0.85.
  - Teaching, tutoring, or mentoring technical subjects → communication and \
problem-solving skills. Confidence >= 0.8.
  - ML/AI coursework or projects → Python proficiency, mathematics, data handling.
  - In general: if a reasonable senior engineer would consider the skill \
OBVIOUSLY REQUIRED to do what the candidate has done, score it high.
- confidence levels:
  - 0.85-1.0: clearly demonstrated, explicitly or obviously implied
  - 0.6-0.84: strongly implied by tools/frameworks/projects used
  - 0.3-0.59: weak or tangential signal
  - 0.0: genuinely no evidence whatsoever
- Set matched=true whenever confidence >= 0.4.
- Never give 0% for a fundamental skill (OOP, data structures, problem-solving) \
when the candidate has years of programming experience — that is not credible.
- evidence must explain the reasoning, e.g. \
"Implicit: taught ML frameworks which are class-based and require OOP mastery".
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
  "seniority_alignment": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase copied verbatim from the resume"},
  "years_of_experience": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase copied verbatim from the resume"},
  "project_complexity": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase copied verbatim from the resume"},
  "domain_relevance": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase copied verbatim from the resume"},
  "overall": 0.0-1.0
}

CRITICAL rules on seniority:
- If the candidate is MORE experienced than the role requires, treat them as \
OVERQUALIFIED — this is a positive signal, not a penalty. Score seniority_alignment \
at 0.9-1.0 and note "Overqualified — brings more than required".
- Never penalise a candidate for having too much experience. A senior engineer \
applying for a junior role has every skill needed and more.
- Only score seniority low if the candidate is clearly UNDER-qualified.
- years_of_experience should also score high when the candidate exceeds requirements.
- overall must reflect that an overqualified candidate is a strong match.

The evidence field must be copied word-for-word from the resume. Do not paraphrase.
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
  "collaboration_signals": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase copied verbatim from the resume"},
  "communication_style": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase copied verbatim from the resume"},
  "initiative_indicators": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase copied verbatim from the resume"},
  "overall": 0.0-1.0
}

The evidence field must be copied word-for-word from the resume. Do not paraphrase.
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
# Combined scoring (single LLM call for all three dimensions)
# ---------------------------------------------------------------------------

COMBINED_SCORING_SYSTEM_PROMPT = """\
You are an expert technical recruiter. Evaluate the candidate's resume against \
the job description across three dimensions in a single pass.

Return **only** valid JSON (no markdown fences):
{
  "skill_match": {
    "skills": [
      {
        "skill": "string",
        "matched": true/false,
        "confidence": 0.0-1.0,
        "evidence": "brief quote or explanation from the resume"
      }
    ]
  },
  "experience_match": {
    "seniority_alignment": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase from resume"},
    "years_of_experience": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase from resume"},
    "project_complexity": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase from resume"},
    "domain_relevance": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase from resume"},
    "overall": 0.0-1.0
  },
  "culture_match": {
    "collaboration_signals": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase from resume"},
    "communication_style": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase from resume"},
    "initiative_indicators": {"score": 0.0-1.0, "reasoning": "string", "evidence": "exact phrase from resume"},
    "overall": 0.0-1.0
  }
}

Skill match rules:
- STRONG implicit inference required — do not penalise candidates for not spelling \
out fundamentals that are obviously demonstrated:
  - Any Python project or ML work → data types and basic data structures are \
prerequisite knowledge. Confidence >= 0.85.
  - Any Python framework (Django, Flask, FastAPI, PyTorch, TensorFlow, Keras, \
scikit-learn) → OOP is required to use them. Confidence >= 0.85.
  - Git mentioned or any team/open-source work → version control. Confidence >= 0.85.
  - Never give 0% for a fundamental skill when the candidate has years of \
programming experience — that is not credible.
- confidence: 0.85-1.0 clearly demonstrated; 0.6-0.84 strongly implied; \
0.3-0.59 weak signal; 0.0 genuinely no evidence.
- Set matched=true when confidence >= 0.4.

Seniority rules:
- If the candidate is MORE experienced than the role requires, treat them as \
OVERQUALIFIED — score seniority_alignment 0.9-1.0, note "Overqualified — brings \
more than required". Never penalise excess experience.
- Only score seniority low if the candidate is clearly UNDER-qualified.

Evidence fields must be copied word-for-word from the resume. Do not paraphrase.
"""


def score_all_dimensions(
    resume_text: str,
    jd_text: str,
    jd_skills: list[str],
) -> tuple[float, dict, float, dict, float, dict]:
    """Score skill, experience, and culture match in a single LLM call.

    Returns (skill_score, skill_details, exp_score, exp_details, cult_score, cult_details).
    """
    user_content = (
        f"## Required Skills\n{json.dumps(jd_skills)}\n\n"
        f"## Job Description\n{jd_text}\n\n"
        f"## Resume\n{resume_text}"
    )
    result = _llm_json_request(COMBINED_SCORING_SYSTEM_PROMPT, user_content)

    # Skill
    skill_details = result.get("skill_match", {})
    skills_list = skill_details.get("skills", [])
    if skills_list:
        skill_score = sum(s.get("confidence", 0.0) for s in skills_list) / len(skills_list)
    else:
        skill_score = 0.0

    # Experience
    exp_details = result.get("experience_match", {})
    exp_score = float(exp_details.get("overall", 0.0))

    # Culture
    cult_details = result.get("culture_match", {})
    cult_score = float(cult_details.get("overall", 0.0))

    return (
        max(0.0, min(1.0, skill_score)), skill_details,
        max(0.0, min(1.0, exp_score)), exp_details,
        max(0.0, min(1.0, cult_score)), cult_details,
    )


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
