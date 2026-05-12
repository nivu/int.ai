"""Pydantic models for the AI voice interview API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class CreateRoomRequest(BaseModel):
    session_id: str


class CreateRoomResponse(BaseModel):
    token: str
    server_url: str


class HiringPostInfo(BaseModel):
    title: str
    department: str | None = None


class ApplicationInfo(BaseModel):
    id: str
    candidate_id: str
    hiring_post: HiringPostInfo


class TemplateInfo(BaseModel):
    max_duration_minutes: int
    max_questions: int


class PendingSessionResponse(BaseModel):
    id: str
    status: str
    deadline: datetime
    consent_given_at: datetime | None = None
    application: ApplicationInfo
    template: TemplateInfo


class ReconnectRequest(BaseModel):
    session_id: str
    reconnection_token: str


class ReconnectResponse(BaseModel):
    session_id: str
    room_name: str
    candidate_token: str
    expires_at: datetime


class EvaluateRequest(BaseModel):
    session_id: str


class EvaluateResponse(BaseModel):
    task_id: str
    status: str
