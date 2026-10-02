"""Scoring service — compute resume-to-JD match scores via embeddings and OpenAI."""

from __future__ import annotations

import json
import logging
import time

from openai import OpenAI

from app.config import settings
from app.services.embeddings import compute_similarity, embed_text
from app.services.supabase import supabase
from app.services.usage import record_openai_chat

logger = logging.getLogger("int.ai")

# Chosen over gpt-4o-mini for steadier implied-skill judgements at ~0.5 cents
# per screening (see spec 001 FR-007a).
SCORING_MODEL = "gpt-4.1-mini"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _llm_json_request(system_prompt: str, user_content: str) -> dict:
    """Send a request to OpenAI requesting JSON output and return parsed dict."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())

    start = time.time()
    response = client.chat.completions.create(
        model=SCORING_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    latency = time.time() - start
    record_openai_chat(response, "score_resume", latency_ms=latency * 1000)

    usage = response.usage
    logger.info(
        "OpenAI scoring call: latency=%.2fs prompt_tokens=%s completion_tokens=%s",
        latency,
        usage.prompt_tokens if usage else None,
        usage.completion_tokens if usage else None,
    )

    return json.loads(response.choices[0].message.content)


def _apply_alternative_groups(skill_details: dict) -> None:
    """Credit accepted alternatives deterministically (spec FR-007a).

    For each group of required skills the job accepts as alternatives, a
    covered member marks the group's missing members as implied by it. Applying
    this in code rather than in the prompt keeps it consistent run to run.
    """
    skills = {s.get("skill"): s for s in skill_details.get("skills", [])}
    for group in skill_details.get("alternative_groups") or []:
        if not isinstance(group, list):
            continue
        members = [skills[name] for name in group if name in skills]
        covered = next(
            (m for m in members if m.get("match_type") in ("direct", "implied")), None
        )
        if covered is None or len(members) < 2:
            continue
        for m in members:
            if m.get("match_type") not in ("direct", "implied"):
                m["match_type"] = "implied"
                m["implied_by"] = f"{covered['skill']} (accepted alternative in the job description)"
                m["evidence"] = covered.get("evidence", "")


def _skill_coverage(skills_list: list[dict]) -> float:
    """Share of required skills covered, directly or implied (spec FR-007a).

    Normalises each entry in place so ``matched`` always agrees with
    ``match_type``. Entries from prompts that predate ``match_type`` fall
    back to ``matched``.
    """
    if not skills_list:
        return 0.0
    covered = 0
    for s in skills_list:
        match_type = s.get("match_type")
        if match_type not in ("direct", "implied", "missing"):
            match_type = "direct" if s.get("matched") else "missing"
            s["match_type"] = match_type
        s["matched"] = match_type != "missing"
        if s["matched"]:
            covered += 1
    return covered / len(skills_list)


# ---------------------------------------------------------------------------
# Embedding similarity
# ---------------------------------------------------------------------------

def score_embedding_similarity(resume_text: str, jd_text: str) -> float:
    """Embed resume and JD texts and return their cosine similarity (0.0-1.0)."""
    vec_resume = embed_text(resume_text)
    vec_jd = embed_text(jd_text, operation="embed_job_description")
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

    return _skill_coverage(details.get("skills", [])), details


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
    "alternative_groups": [["required skill names, copied exactly from the Required Skills list, that the job description accepts as alternatives to each other"]],
    "skills": [
      {
        "skill": "string — the required skill, exactly as given",
        "reasoning": "one sentence, written BEFORE choosing match_type: is it named in the resume? if not, which resume work requires it, or which accepted alternative does the resume show?",
        "match_type": "direct" | "implied" | "missing",
        "implied_by": "string — for implied only: the resume tools/work that imply it, e.g. 'LangGraph multi-agent LLM workflows'; otherwise empty",
        "confidence": 0.0-1.0,
        "evidence": "exact phrase copied verbatim from the resume; empty when missing"
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

Skill match — work in two passes.

Pass 1: read the job description and list in alternative_groups every group \
of REQUIRED SKILLS it accepts as alternatives to each other (phrases like \
"several of A, B, C", "A or B", "A, B or equivalent", "such as A, B"). Use \
the exact names from the Required Skills list; a group needs at least two of \
them. Example: the job says "several of OpenAI APIs, Anthropic APIs, Hugging \
Face, LangChain or LangGraph" and the required skills include "OpenAI API", \
"Anthropic API" and "LangChain / LangGraph" → \
["OpenAI API", "Anthropic API", "LangChain / LangGraph"]. Return [] if none.

Pass 2: classify every required skill as exactly one of:
- "direct": the skill, or an obvious synonym of it, is named in the resume \
(e.g. "PyTorch" listed under skills; "Postgres" for "SQL / PostgreSQL").
- "implied": not named, but the work the resume describes could not \
reasonably have been done without it, or the resume shows a listed \
alternative where the job accepts alternatives. Examples:
  - Building LLM agents/apps with LangChain or LangGraph → hands-on LLM \
provider API use (e.g. "OpenAI API"), since those frameworks call such APIs.
  - A required skill is in a Pass 1 alternatives group and the resume shows \
hands-on use of another member of that group (e.g. the job says "several of \
OpenAI APIs, Anthropic APIs, LangChain or LangGraph" and the resume shows \
LangGraph) → implied by that member.
  - A retrieval + answer-synthesis pipeline over documents → RAG.
  - Any Python framework (Django, Flask, FastAPI, PyTorch) → OOP.
  Always fill implied_by with the specific resume work it is implied by, and \
that work must genuinely require the skill — an unrelated phrase is not a \
reason.
- "missing": neither of the above. Do NOT imply from mere topic adjacency: \
Python does not imply Docker; ML work does not imply CI/CD or cloud; a \
GitHub profile link alone is not evidence of a skill.
- confidence (0.0-1.0) is how sure you are of the classification.
- evidence must be copied word-for-word from the RESUME. Never quote the job \
description as evidence.

Culture match rules:
- If a "Culture Expectation" section is given, score each culture signal and \
overall by how well the candidate fits THAT expectation (e.g. a \
"professional, client-facing" post vs a "hacker, self-directed builder" post \
value different signals). Otherwise infer the expected culture from the job \
description.

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
    culture_expectation: str | None = None,
) -> tuple[float, dict, float, dict, float, dict]:
    """Score skill, experience, and culture match in a single LLM call.

    Returns (skill_score, skill_details, exp_score, exp_details, cult_score, cult_details).
    """
    user_content = (
        f"## Required Skills\n{json.dumps(jd_skills)}\n\n"
        f"## Job Description\n{jd_text}\n\n"
    )
    if culture_expectation and culture_expectation.strip():
        user_content += f"## Culture Expectation\n{culture_expectation.strip()}\n\n"
    user_content += f"## Resume\n{resume_text}"
    result = _llm_json_request(COMBINED_SCORING_SYSTEM_PROMPT, user_content)

    # Skill
    skill_details = result.get("skill_match", {})
    _apply_alternative_groups(skill_details)
    skill_score = _skill_coverage(skill_details.get("skills", []))

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


def load_culture_expectation(hiring_post_id: str) -> str | None:
    """Return the post's internal culture expectation (hiring_post_private), if set."""
    rows = (
        supabase.table("hiring_post_private")
        .select("culture_expectation")
        .eq("hiring_post_id", hiring_post_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0].get("culture_expectation") if rows else None


# ---------------------------------------------------------------------------
# Weighted aggregate
# ---------------------------------------------------------------------------

# Fixed for every post (spec FR-008). Mirrored in the compute_overall_score()
# database trigger (migration 027) — change both together.
SCORING_WEIGHTS = {
    "embedding_similarity": 0.15,
    "skill_match": 0.35,
    "experience_match": 0.35,
    "culture_match": 0.15,
}


def compute_overall_score(scores: dict) -> float:
    """Compute the fixed-weight aggregate of the four scoring dimensions.

    *scores* should have keys: embedding_similarity, skill_match,
    experience_match, culture_match — each a float 0.0-1.0.
    """
    weighted_sum = sum(scores.get(k, 0.0) * w for k, w in SCORING_WEIGHTS.items())
    return max(0.0, min(1.0, weighted_sum))
