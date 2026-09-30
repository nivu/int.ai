"""Pipeline health API — the dashboard's "Needs attention" list."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException

from app.api.auth import _resolve_admin_org
from app.services.pipeline_health import find_issues

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.get("/issues")
async def list_pipeline_issues(authorization: str = Header(...)) -> dict[str, list[dict[str, Any]]]:
    """Applications whose screening failed or never ran, and interviews with no evaluation."""
    org_id = _resolve_admin_org(authorization)
    try:
        return {"items": find_issues(org_id)}
    except Exception as exc:
        logger.exception("Failed to check pipeline issues for org=%s", org_id)
        raise HTTPException(status_code=500, detail="Failed to check pipeline issues") from exc
