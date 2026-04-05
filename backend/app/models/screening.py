"""Pydantic models for the resume screening API."""

from __future__ import annotations

from pydantic import BaseModel


class ScreeningTriggerRequest(BaseModel):
    application_id: str
    hiring_post_id: str


class ScreeningTriggerResponse(BaseModel):
    task_id: str
    status: str


class ScreeningStatusResponse(BaseModel):
    task_id: str
    status: str
    result: dict | None = None
