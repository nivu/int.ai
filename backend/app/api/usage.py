"""Usage API — AI and voice spend for the caller's org (Settings → Usage)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query

from app.api.auth import _resolve_admin_org
from app.services.usage_report import usage_summary

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("")
def get_usage(
    days: int = Query(30, ge=1, le=90),
    authorization: str = Header(...),
) -> dict[str, Any]:
    """Estimated cost and call counts over the last ``days`` days (UTC)."""
    org_id = _resolve_admin_org(authorization)
    try:
        return usage_summary(org_id, days)
    except Exception as exc:
        logger.exception("Failed to build usage summary for org=%s", org_id)
        raise HTTPException(status_code=500, detail="Failed to load usage") from exc
