"""Resume file download for staff and granted clients — one resume as a signed
link, or every resume of a job as a zip written to storage and signed.

The backend decides who may download and reads files with the service key, so
no storage policy is involved; see specs/004-resume-download/spec.md.
"""

from __future__ import annotations

import io
import logging
import re
import zipfile

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.services.supabase import supabase

logger = logging.getLogger("int.ai")

router = APIRouter(tags=["resumes"])

BUCKET = "resumes"
LINK_SECONDS = 300
_STAFF_ROLES = ["admin", "recruiter", "hiring_manager"]


class ResumeLinkResponse(BaseModel):
    url: str
    filename: str
    expires_in: int


class ResumeExportResponse(ResumeLinkResponse):
    included: int
    skipped: int


def _caller(authorization: str) -> str:
    """Return the caller's auth user id from their JWT."""
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    try:
        return str(supabase.auth.get_user(token).user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _access(user_id: str, post: dict) -> str:
    """Return ``"staff"`` or ``"client"`` if the caller may see ``post``, else 403."""
    members = (
        supabase.table("team_members")
        .select("org_id, status")
        .eq("user_id", user_id)
        .in_("role", _STAFF_ROLES)
        .execute()
        .data
        or []
    )
    if any(m.get("org_id") == post["org_id"] and m.get("status") == "active" for m in members):
        return "staff"

    data = supabase.rpc("client_post_ids_for_user", {"p_user_id": user_id}).execute().data or []
    post_ids = {str(next(iter(r.values()))) if isinstance(r, dict) else str(r) for r in data}
    if str(post["id"]) in post_ids:
        return "client"

    raise HTTPException(status_code=403, detail="Access denied")


def _post(job_id: str) -> dict:
    rows = (
        supabase.table("hiring_posts")
        .select("id, title, org_id")
        .eq("id", job_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Job not found")
    return rows[0]


def _ext(path: str, filename: str | None) -> str:
    for name in (filename or "", path):
        match = re.search(r"\.[A-Za-z0-9]{1,5}$", name)
        if match:
            return match.group(0).lower()
    return ""


def _safe(name: str | None, fallback: str) -> str:
    cleaned = re.sub(r"[^\w .()-]+", "", name or "", flags=re.UNICODE).strip(" .")
    return cleaned[:100] or fallback


def _sign(path: str, download_as: str) -> str:
    response = supabase.storage.from_(BUCKET).create_signed_url(
        path, LINK_SECONDS, {"download": download_as}
    )
    return response["signedURL"]


@router.get("/applications/{application_id}/resume", response_model=ResumeLinkResponse)
async def download_resume(application_id: str, authorization: str = Header(...)) -> dict:
    user_id = _caller(authorization)
    rows = (
        supabase.table("applications")
        .select("id, hiring_post_id, resume_url, resume_filename")
        .eq("id", application_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Application not found")
    application = rows[0]
    role = _access(user_id, _post(application["hiring_post_id"]))

    path = application.get("resume_url")
    if not path:
        raise HTTPException(status_code=404, detail="Resume not available")
    ext = _ext(path, application.get("resume_filename"))
    filename = _safe(application.get("resume_filename"), "resume")
    if ext and not filename.lower().endswith(ext):
        filename += ext
    try:
        url = _sign(path, filename)
    except Exception:
        logger.warning("Resume file missing for application %s", application_id, exc_info=True)
        raise HTTPException(status_code=404, detail="Resume not available")

    logger.info("resume_download user=%s access=%s application=%s", user_id, role, application_id)
    return {"url": url, "filename": filename, "expires_in": LINK_SECONDS}


@router.post("/jobs/{job_id}/resume-export", response_model=ResumeExportResponse)
async def export_resumes(job_id: str, authorization: str = Header(...)) -> dict:
    user_id = _caller(authorization)
    post = _post(job_id)
    role = _access(user_id, post)

    applications = (
        supabase.table("applications")
        .select("id, resume_url, resume_filename, candidate:candidates(full_name)")
        .eq("hiring_post_id", job_id)
        .order("created_at")
        .execute()
        .data
        or []
    )

    buffer = io.BytesIO()
    used: set[str] = set()
    included = skipped = 0
    storage = supabase.storage.from_(BUCKET)
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for application in applications:
            path = application.get("resume_url")
            if not path:
                skipped += 1
                continue
            try:
                content = storage.download(path)
            except Exception:
                logger.warning("Resume file missing for application %s", application["id"])
                skipped += 1
                continue
            base = _safe((application.get("candidate") or {}).get("full_name"), "candidate")
            ext = _ext(path, application.get("resume_filename"))
            name, n = f"{base}{ext}", 2
            while name.lower() in used:
                name, n = f"{base} ({n}){ext}", n + 1
            used.add(name.lower())
            archive.writestr(name, content)
            included += 1

    if included == 0:
        raise HTTPException(status_code=404, detail="No resumes available for this job")

    export_path = f"exports/{job_id}/resumes.zip"
    filename = (
        f"{re.sub(r'[^a-z0-9]+', '-', post['title'].lower()).strip('-') or 'job'}-resumes.zip"
    )
    try:
        storage.upload(
            export_path,
            buffer.getvalue(),
            {"content-type": "application/zip", "upsert": "true"},
        )
        url = _sign(export_path, filename)
    except Exception as exc:
        logger.exception("Failed to store resume export for job %s", job_id)
        raise HTTPException(status_code=502, detail="Failed to build the resume zip") from exc

    logger.info(
        "resume_export user=%s access=%s job=%s included=%d skipped=%d",
        user_id,
        role,
        job_id,
        included,
        skipped,
    )
    return {
        "url": url,
        "filename": filename,
        "expires_in": LINK_SECONDS,
        "included": included,
        "skipped": skipped,
    }
