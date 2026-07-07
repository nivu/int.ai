"""Screening API router — trigger and monitor resume screening tasks."""

from __future__ import annotations

import logging

from celery.result import AsyncResult
from fastapi import APIRouter, Header, HTTPException

from app.api.auth import _resolve_admin_org
from app.models.screening import (
    ScreeningStatusResponse,
    ScreeningTriggerRequest,
    ScreeningTriggerResponse,
)
from app.services.supabase import get_record
from app.tasks.screen_resume import screen_resume_task
from app.worker import celery_app

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/screening", tags=["screening"])


@router.post("/trigger", response_model=ScreeningTriggerResponse, status_code=202)
async def trigger_screening(
    body: ScreeningTriggerRequest,
    authorization: str = Header(...),
) -> ScreeningTriggerResponse:
    """Enqueue a resume screening task and return immediately."""
    caller_org = _resolve_admin_org(authorization)

    # Verify the hiring post belongs to the caller's org
    post = get_record("hiring_posts", body.hiring_post_id)
    if post["org_id"] != caller_org:
        raise HTTPException(status_code=403, detail="Access denied")
    # Verify the application is for the same hiring post
    app = get_record("applications", body.application_id)
    if app["hiring_post_id"] != body.hiring_post_id:
        raise HTTPException(status_code=400, detail="Application does not belong to the specified hiring post")

    result = screen_resume_task.delay(body.application_id, body.hiring_post_id)
    logger.info(
        "Screening task enqueued: task_id=%s application=%s",
        result.id,
        body.application_id,
    )
    return ScreeningTriggerResponse(task_id=result.id, status="queued")


@router.get("/status/{task_id}", response_model=ScreeningStatusResponse)
async def get_screening_status(
    task_id: str,
    authorization: str = Header(...),
) -> ScreeningStatusResponse:
    """Query the current state of a screening task."""
    _resolve_admin_org(authorization)
    result = AsyncResult(task_id, app=celery_app)
    response = ScreeningStatusResponse(
        task_id=task_id,
        status=result.status,
        result=result.result if result.ready() else None,
    )
    return response
