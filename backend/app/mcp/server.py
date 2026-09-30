"""MCP server definition: tools for jobs, candidates, and pipeline status.

Every tool acts inside the org of the API key that authenticated the request
(see ``app.mcp.auth``). Nothing here sends email.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any, Literal

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette

from app.config import settings
from app.mcp.auth import MCP_SCOPE, ApiKeyVerifier
from app.services.supabase import supabase as sb

logger = logging.getLogger("int.ai")

JobStatus = Literal["draft", "published", "closed", "archived"]
ApplicationStatus = Literal[
    "applied",
    "screened",
    "interview_sent",
    "interviewed",
    "shortlisted",
    "resume_rejected",
    "interview_rejected",
]
LocationType = Literal["remote", "onsite", "hybrid"]

JOB_COLUMNS = (
    "id, title, department, status, location_type, location, description, required_skills, "
    "experience_min, experience_max, education_requirements, scoring_weights, screening_threshold, "
    "interview_template_id, created_at, published_at, closes_at, share_slug"
)
APPLICATION_COLUMNS = (
    "id, hiring_post_id, candidate_id, status, overall_score, skill_match_score, experience_match_score, "
    "culture_match_score, decision, recruiter_override, recruiter_notes, screening_completed_at, "
    "interview_invited_at, interview_deadline, created_at"
)


# ---------------------------------------------------------------------------
# Auth context + org-scoped lookups
# ---------------------------------------------------------------------------


def _actor() -> tuple[str, str]:
    """Return (org_id, team_member_id) for the authenticated API key."""
    token = get_access_token()
    if token is None or not token.claims:
        raise ToolError("Unauthenticated MCP request")
    return token.claims["org_id"], token.claims["team_member_id"]


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _org_job(org_id: str, job_id: str) -> dict[str, Any]:
    rows = sb.table("hiring_posts").select(JOB_COLUMNS).eq("id", job_id).eq("org_id", org_id).limit(1).execute().data
    if not rows:
        raise ToolError(f"Job {job_id} not found in your organisation")
    return rows[0]


def _org_job_ids(org_id: str) -> list[str]:
    rows = sb.table("hiring_posts").select("id").eq("org_id", org_id).execute().data or []
    return [r["id"] for r in rows]


def _org_application(org_id: str, application_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (application, job) after checking the job belongs to the org."""
    rows = sb.table("applications").select(APPLICATION_COLUMNS).eq("id", application_id).limit(1).execute().data
    if not rows:
        raise ToolError(f"Application {application_id} not found")
    application = rows[0]
    job = _org_job(org_id, application["hiring_post_id"])
    return application, job


def _application_counts(job_ids: list[str]) -> dict[str, int]:
    if not job_ids:
        return {}
    rows = sb.table("applications").select("hiring_post_id").in_("hiring_post_id", job_ids).execute().data or []
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["hiring_post_id"]] = counts.get(r["hiring_post_id"], 0) + 1
    return counts


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

mcp_server = MCPServer(
    name="int.ai",
    instructions=(
        "Hiring operations for one organisation: list/create jobs, review candidates, and read pipeline "
        "status. IDs are UUIDs. Scores are fractions 0-1. Nothing here sends email."
    ),
    token_verifier=ApiKeyVerifier(),
    auth=AuthSettings(
        issuer_url=settings.BACKEND_PUBLIC_URL,
        resource_server_url=f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}/mcp",
        required_scopes=[MCP_SCOPE],
        # API keys are not OAuth tokens bound to a resource; ApiKeyVerifier
        # already checks the key itself, so skip the audience check.
        validate_token_resource=False,
    ),
)


# ---- Jobs -----------------------------------------------------------------


@mcp_server.tool()
def list_jobs(status: JobStatus | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """List hiring posts in your organisation, newest first. Optionally filter by status."""
    org_id, _ = _actor()
    query = sb.table("hiring_posts").select(JOB_COLUMNS).eq("org_id", org_id).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    jobs = query.limit(max(1, min(limit, 200))).execute().data or []
    counts = _application_counts([j["id"] for j in jobs])
    for j in jobs:
        j.pop("description", None)
        j["application_count"] = counts.get(j["id"], 0)
    return jobs


@mcp_server.tool()
def get_job(job_id: str) -> dict[str, Any]:
    """Get one hiring post with its interview template settings and application counts by stage."""
    org_id, _ = _actor()
    job = _org_job(org_id, job_id)
    if job.get("interview_template_id"):
        tmpl = (
            sb.table("interview_templates")
            .select("id, name, max_questions, max_duration_minutes, custom_questions")
            .eq("id", job["interview_template_id"])
            .limit(1)
            .execute()
            .data
        )
        job["interview_template"] = tmpl[0] if tmpl else None
    apps = sb.table("applications").select("status").eq("hiring_post_id", job_id).execute().data or []
    by_status: dict[str, int] = {}
    for a in apps:
        by_status[a["status"]] = by_status.get(a["status"], 0) + 1
    job["applications_by_status"] = by_status
    job["application_count"] = len(apps)
    job["public_apply_url"] = f"{settings.FRONTEND_URL.rstrip('/')}/apply/{job['share_slug']}" if job.get("share_slug") else None
    return job


@mcp_server.tool()
def create_job(
    title: str,
    description: str,
    department: str | None = None,
    location_type: LocationType = "remote",
    location: str | None = None,
    required_skills: list[str] | None = None,
    experience_min: int = 0,
    experience_max: int = 0,
    education_requirements: str | None = None,
    skill_weight: float = 0.4,
    experience_weight: float = 0.35,
    culture_weight: float = 0.25,
    similarity_weight: float = 0.2,
    screening_threshold: int = 70,
    max_questions: int = 10,
    max_duration_minutes: int = 45,
    custom_questions: list[str] | None = None,
    publish: bool = False,
    closes_at: str | None = None,
) -> dict[str, Any]:
    """Create a hiring post and its interview template.

    Created as a draft unless publish=true.

    The four scoring weights are relative (each is divided by their total, so
    they need not sum to 1): skill_weight, experience_weight, culture_weight
    and similarity_weight (resume-text similarity to the job description).
    Each must be between 0 and 1 and at least one must be positive.
    closes_at is an ISO-8601 timestamp for when applications close (optional).
    """
    org_id, member_id = _actor()
    if not title.strip():
        raise ToolError("title is required")
    if not description.strip():
        raise ToolError("description is required (use generate_job_description to draft one)")
    weights = {
        "skill_match": skill_weight,
        "experience_match": experience_weight,
        "culture_match": culture_weight,
        "embedding_similarity": similarity_weight,
    }
    if any(not 0.0 <= w <= 1.0 for w in weights.values()):
        raise ToolError("each scoring weight must be between 0 and 1")
    if sum(weights.values()) <= 0:
        raise ToolError("at least one scoring weight must be greater than 0")
    if not 0 <= screening_threshold <= 100:
        raise ToolError("screening_threshold must be between 0 and 100")

    template = (
        sb.table("interview_templates")
        .insert(
            {
                "org_id": org_id,
                "name": f"{title.strip()} Interview",
                "max_questions": max_questions,
                "max_duration_minutes": max_duration_minutes,
                "custom_questions": custom_questions or [],
            }
        )
        .execute()
        .data[0]
    )
    now = _now()
    post = (
        sb.table("hiring_posts")
        .insert(
            {
                "org_id": org_id,
                "created_by": member_id,
                "title": title.strip(),
                "department": department,
                "location_type": location_type,
                "location": location,
                "description": description.strip(),
                "required_skills": required_skills or [],
                "experience_min": experience_min,
                "experience_max": experience_max,
                "education_requirements": education_requirements,
                "scoring_weights": weights,
                "screening_threshold": screening_threshold,
                "interview_template_id": template["id"],
                "status": "published" if publish else "draft",
                "published_at": now if publish else None,
                "closes_at": closes_at,
            }
        )
        .execute()
        .data[0]
    )
    logger.info("MCP create_job id=%s org=%s by=%s", post["id"], org_id, member_id)
    return get_job(post["id"])


@mcp_server.tool()
def update_job_status(job_id: str, status: Literal["published", "closed", "archived"]) -> dict[str, Any]:
    """Publish, close, or archive a hiring post."""
    org_id, member_id = _actor()
    job = _org_job(org_id, job_id)
    patch: dict[str, Any] = {"status": status, "updated_at": _now()}
    if status == "published" and not job.get("published_at"):
        patch["published_at"] = _now()
    sb.table("hiring_posts").update(patch).eq("id", job_id).execute()
    logger.info("MCP update_job_status id=%s %s->%s by=%s", job_id, job["status"], status, member_id)
    return {"job_id": job_id, "previous_status": job["status"], "status": status}


@mcp_server.tool()
async def generate_job_description(
    title: str,
    department: str | None = None,
    location_type: LocationType | None = None,
    location: str | None = None,
    required_skills: list[str] | None = None,
    experience_min: int | None = None,
    experience_max: int | None = None,
    education_requirements: str | None = None,
) -> str:
    """Draft a job description with AI from the role details. Returns plain text to pass to create_job."""
    org_id, _ = _actor()
    from app.api.jobs import GenerateDescriptionRequest, _generate_description

    result = _generate_description(
        GenerateDescriptionRequest(
            title=title,
            department=department,
            location_type=location_type,
            location=location,
            required_skills=required_skills or [],
            experience_min=experience_min,
            experience_max=experience_max,
            education_requirements=education_requirements,
        ),
        org_id,
    )
    return result.description


# ---- Candidates -------------------------------------------------------------


def _candidate_rows(org_id: str, applications: list[dict[str, Any]], job_titles: dict[str, str]) -> list[dict[str, Any]]:
    if not applications:
        return []
    candidate_ids = list({a["candidate_id"] for a in applications})
    app_ids = [a["id"] for a in applications]
    candidates = {
        c["id"]: c
        for c in (
            sb.table("candidates")
            .select("id, full_name, email, phone, current_role, current_company, years_experience, location, linkedin_url")
            .in_("id", candidate_ids)
            .execute()
            .data
            or []
        )
    }
    skills = {
        r["application_id"]: r.get("parsed_skills") or []
        for r in (
            sb.table("resume_data").select("application_id, parsed_skills").in_("application_id", app_ids).execute().data
            or []
        )
    }
    out: list[dict[str, Any]] = []
    for a in applications:
        c = candidates.get(a["candidate_id"], {})
        out.append(
            {
                "application_id": a["id"],
                "candidate_id": a["candidate_id"],
                "name": c.get("full_name"),
                "email": c.get("email"),
                "current_role": c.get("current_role"),
                "current_company": c.get("current_company"),
                "years_experience": c.get("years_experience"),
                "location": c.get("location"),
                "linkedin_url": c.get("linkedin_url"),
                "job_id": a["hiring_post_id"],
                "job_title": job_titles.get(a["hiring_post_id"]),
                "status": a["status"],
                "overall_score": a.get("overall_score"),
                "key_skills": skills.get(a["id"], [])[:8],
                "applied_at": a.get("created_at"),
            }
        )
    return out


@mcp_server.tool()
def list_candidates(
    job_id: str | None = None,
    status: ApplicationStatus | None = None,
    search: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List applications (candidates) in your organisation, newest first.

    Filter by job_id, status, or a search term matched against name, email, and skills.
    """
    org_id, _ = _actor()
    if job_id:
        _org_job(org_id, job_id)
        job_ids = [job_id]
    else:
        job_ids = _org_job_ids(org_id)
    if not job_ids:
        return []
    titles = {
        j["id"]: j["title"]
        for j in (sb.table("hiring_posts").select("id, title").in_("id", job_ids).execute().data or [])
    }
    query = sb.table("applications").select(APPLICATION_COLUMNS).in_("hiring_post_id", job_ids).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    applications = query.limit(500).execute().data or []
    rows = _candidate_rows(org_id, applications, titles)
    if search:
        q = search.lower()
        rows = [
            r
            for r in rows
            if q in (r["name"] or "").lower()
            or q in (r["email"] or "").lower()
            or any(q in s.lower() for s in r["key_skills"])
        ]
    return rows[: max(1, min(limit, 200))]


@mcp_server.tool()
def get_candidate(application_id: str) -> dict[str, Any]:
    """Full view of one application: candidate profile, parsed resume, score breakdown, interview report."""
    org_id, _ = _actor()
    application, job = _org_application(org_id, application_id)
    candidate = (
        sb.table("candidates")
        .select("id, full_name, email, phone, current_role, current_company, years_experience, location, linkedin_url")
        .eq("id", application["candidate_id"])
        .limit(1)
        .execute()
        .data
    )
    resume = (
        sb.table("resume_data")
        .select(
            "parsed_summary, parsed_skills, parsed_experience, parsed_education, parsed_projects, "
            "parsed_certifications, skill_match_details, experience_match_details, culture_match_details, parsing_error"
        )
        .eq("application_id", application_id)
        .limit(1)
        .execute()
        .data
    )
    session = (
        sb.table("interview_sessions")
        .select("id, status, started_at, ended_at, duration_seconds, questions_asked")
        .eq("application_id", application_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    report = None
    if session:
        report_rows = (
            sb.table("interview_reports")
            .select("overall_grade, recommendation, recommendation_detail, summary, strengths, concerns, dimension_averages, notable_responses")
            .eq("session_id", session[0]["id"])
            .limit(1)
            .execute()
            .data
        )
        report = report_rows[0] if report_rows else None
    return {
        "application": application,
        "job": {"id": job["id"], "title": job["title"], "status": job["status"]},
        "candidate": candidate[0] if candidate else None,
        "resume": resume[0] if resume else None,
        "interview_session": session[0] if session else None,
        "interview_report": report,
    }


@mcp_server.tool()
def review_candidate(
    application_id: str,
    action: Literal["shortlist", "reject"],
    notes: str | None = None,
) -> dict[str, Any]:
    """Shortlist or reject an application. Optionally record recruiter notes.

    Rejecting sets interview_rejected if the candidate has interviewed, otherwise resume_rejected.
    Only the status changes; no email is sent.
    """
    org_id, member_id = _actor()
    application, job = _org_application(org_id, application_id)
    previous = application["status"]
    if action == "shortlist":
        new_status = "shortlisted"
    else:
        new_status = "interview_rejected" if previous == "interviewed" else "resume_rejected"
    patch: dict[str, Any] = {"status": new_status, "updated_at": _now()}
    if notes:
        patch["recruiter_notes"] = notes.strip()
    sb.table("applications").update(patch).eq("id", application_id).execute()
    logger.info("MCP review_candidate app=%s %s->%s by=%s", application_id, previous, new_status, member_id)
    return {
        "application_id": application_id,
        "job_title": job["title"],
        "previous_status": previous,
        "status": new_status,
        "recruiter_notes": patch.get("recruiter_notes", application.get("recruiter_notes")),
    }


# ---- Status -----------------------------------------------------------------


@mcp_server.tool()
def get_pipeline_status(job_id: str | None = None) -> list[dict[str, Any]]:
    """Application counts per stage, for one job or every job in your organisation."""
    org_id, _ = _actor()
    if job_id:
        jobs = [_org_job(org_id, job_id)]
    else:
        jobs = (
            sb.table("hiring_posts")
            .select("id, title, status, published_at, closes_at")
            .eq("org_id", org_id)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
    if not jobs:
        return []
    apps = (
        sb.table("applications").select("hiring_post_id, status").in_("hiring_post_id", [j["id"] for j in jobs]).execute().data
        or []
    )
    by_job: dict[str, dict[str, int]] = {}
    for a in apps:
        by_job.setdefault(a["hiring_post_id"], {})
        by_job[a["hiring_post_id"]][a["status"]] = by_job[a["hiring_post_id"]].get(a["status"], 0) + 1
    return [
        {
            "job_id": j["id"],
            "title": j["title"],
            "job_status": j["status"],
            "published_at": j.get("published_at"),
            "closes_at": j.get("closes_at"),
            "total_applications": sum(by_job.get(j["id"], {}).values()),
            "by_stage": by_job.get(j["id"], {}),
        }
        for j in jobs
    ]


@mcp_server.tool()
def get_screening_status(application_id: str) -> dict[str, Any]:
    """Whether resume screening has finished for an application, with the result if so."""
    org_id, _ = _actor()
    application, job = _org_application(org_id, application_id)
    resume = (
        sb.table("resume_data")
        .select("parsing_error, created_at")
        .eq("application_id", application_id)
        .limit(1)
        .execute()
        .data
    )
    completed = application.get("screening_completed_at") is not None
    return {
        "application_id": application_id,
        "job_title": job["title"],
        "screening_completed": completed,
        "screening_completed_at": application.get("screening_completed_at"),
        "parsing_error": resume[0].get("parsing_error") if resume else None,
        "status": application["status"],
        "decision": application.get("decision"),
        "overall_score": application.get("overall_score"),
        "skill_match_score": application.get("skill_match_score"),
        "experience_match_score": application.get("experience_match_score"),
        "culture_match_score": application.get("culture_match_score"),
    }


# ---------------------------------------------------------------------------
# ASGI app factory
# ---------------------------------------------------------------------------


def build_mcp_app() -> Starlette:
    """Starlette app serving the MCP endpoint at ``/mcp``.

    Mounted at the root of the FastAPI app. DNS-rebinding protection is off
    because every request must carry a valid API key; the deployment's public
    hostname is not known at import time.
    """
    return mcp_server.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
