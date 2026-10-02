"""Pydantic models for the resume screening API."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


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


class RescoreRequest(BaseModel):
    application_ids: list[UUID] = Field(min_length=1, max_length=200)


class RescoreResponse(BaseModel):
    queued: list[str]
    skipped: dict[str, str]  # application_id -> reason
