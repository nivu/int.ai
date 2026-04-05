"""Screening API router — trigger and monitor resume screening tasks."""

from __future__ import annotations

import logging

from celery.result import AsyncResult
from fastapi import APIRouter

from app.models.screening import (
    ScreeningStatusResponse,
    ScreeningTriggerRequest,
    ScreeningTriggerResponse,
)
from app.tasks.screen_resume import screen_resume_task
from app.worker import celery_app

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/screening", tags=["screening"])


@router.post("/trigger", response_model=ScreeningTriggerResponse, status_code=202)
async def trigger_screening(body: ScreeningTriggerRequest) -> ScreeningTriggerResponse:
    """Enqueue a resume screening task and return immediately."""
    result = screen_resume_task.delay(body.application_id, body.hiring_post_id)
    logger.info(
        "Screening task enqueued: task_id=%s application=%s",
        result.id,
        body.application_id,
    )
    return ScreeningTriggerResponse(task_id=result.id, status="queued")


@router.get("/status/{task_id}", response_model=ScreeningStatusResponse)
async def get_screening_status(task_id: str) -> ScreeningStatusResponse:
    """Query the current state of a screening task."""
    result = AsyncResult(task_id, app=celery_app)
    response = ScreeningStatusResponse(
        task_id=task_id,
        status=result.status,
        result=result.result if result.ready() else None,
    )
    return response
