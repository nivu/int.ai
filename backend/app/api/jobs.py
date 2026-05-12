"""Jobs API — AI-assisted job description generation."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException
from openai import OpenAI
from pydantic import BaseModel

from app.config import settings
from app.services.supabase import supabase

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/jobs", tags=["jobs"])

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class GenerateDescriptionRequest(BaseModel):
    title: str
    department: str | None = None
    location_type: str | None = None  # remote | onsite | hybrid
    location: str | None = None
    required_skills: list[str] = []
    experience_min: int | None = None
    experience_max: int | None = None
    education_requirements: str | None = None


class GenerateDescriptionResponse(BaseModel):
    description: str


class JobCandidate(BaseModel):
    application_id: str
    candidate_id: str
    name: str
    email: str
    job: str
    key_skills: list[str]
    overall: float | None
    status: str


class JobCandidatesResponse(BaseModel):
    items: list[JobCandidate]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an experienced technical recruiter. Write a professional, engaging job \
description for the role described by the user. Use plain text — no markdown \
headers or bullet characters. Structure it as flowing paragraphs:

1. Role overview and what the candidate will do (2-3 sentences)
2. Key responsibilities (4-6 sentences, flowing prose)
3. What we're looking for — skills, experience, background (3-5 sentences)
4. What we offer / why join us (2-3 sentences)

Keep the tone professional but human. Do not include salary ranges or benefits \
specifics unless provided. Do not use placeholder text like "Company Name". \
Return only the description text, nothing else.
"""


@router.post("/generate-description", response_model=GenerateDescriptionResponse)
async def generate_description(req: GenerateDescriptionRequest) -> GenerateDescriptionResponse:
    """Use GPT-4o-mini to draft a job description from the supplied job metadata."""
    if not req.title:
        raise HTTPException(status_code=422, detail="title is required")

    # Build a compact user prompt from whatever the recruiter has filled in
    parts: list[str] = [f"Role: {req.title}"]
    if req.department:
        parts.append(f"Department: {req.department}")
    if req.location_type:
        loc = req.location_type.capitalize()
        if req.location:
            loc += f" — {req.location}"
        parts.append(f"Location: {loc}")
    if req.required_skills:
        parts.append(f"Required skills: {', '.join(req.required_skills)}")
    if req.experience_min is not None or req.experience_max is not None:
        lo = req.experience_min or 0
        hi = req.experience_max
        if hi:
            parts.append(f"Experience: {lo}–{hi} years")
        else:
            parts.append(f"Experience: {lo}+ years")
    if req.education_requirements:
        parts.append(f"Education: {req.education_requirements}")

    user_content = "\n".join(parts)

    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.7,
            max_tokens=600,
        )
        description = response.choices[0].message.content or ""
        logger.info("Generated job description for role=%s", req.title)
        return GenerateDescriptionResponse(description=description.strip())
    except Exception as exc:
        logger.exception("Failed to generate job description")
        raise HTTPException(status_code=502, detail="Description generation failed") from exc


@router.get("/{job_id}/candidates", response_model=JobCandidatesResponse)
async def get_job_candidates(job_id: str) -> JobCandidatesResponse:
    """Return candidates scoped to a single hiring post."""
    try:
        post_rows = (
            supabase.table("hiring_posts")
            .select("id,title")
            .eq("id", job_id)
            .limit(1)
            .execute()
            .data
        )
        if not post_rows:
            raise HTTPException(status_code=404, detail="Job not found")
        job_title = str(post_rows[0].get("title", ""))

        applications = (
            supabase.table("applications")
            .select("id,candidate_id,status,overall_score")
            .eq("hiring_post_id", job_id)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
        if not applications:
            return JobCandidatesResponse(items=[])

        candidate_ids = [a["candidate_id"] for a in applications if a.get("candidate_id")]
        app_ids = [a["id"] for a in applications if a.get("id")]

        candidates = (
            supabase.table("candidates")
            .select("id,full_name,email")
            .in_("id", candidate_ids)
            .execute()
            .data
            or []
        )
        candidate_map = {c["id"]: c for c in candidates}

        resumes = (
            supabase.table("resume_data")
            .select("application_id,parsed_skills")
            .in_("application_id", app_ids)
            .execute()
            .data
            or []
        )
        skills_by_app = {r["application_id"]: (r.get("parsed_skills") or []) for r in resumes}

        items: list[JobCandidate] = []
        for app in applications:
            candidate = candidate_map.get(app.get("candidate_id", ""))
            if not candidate:
                continue
            items.append(
                JobCandidate(
                    application_id=app["id"],
                    candidate_id=candidate["id"],
                    name=candidate.get("full_name", ""),
                    email=candidate.get("email", ""),
                    job=job_title,
                    key_skills=skills_by_app.get(app["id"], []),
                    overall=app.get("overall_score"),
                    status=app.get("status", "applied"),
                )
            )

        return JobCandidatesResponse(items=items)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to fetch job candidates for job_id=%s", job_id)
        raise HTTPException(status_code=500, detail="Failed to fetch job candidates") from exc
