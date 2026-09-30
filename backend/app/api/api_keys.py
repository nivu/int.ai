"""API keys — issue and revoke long-lived keys for the hosted MCP server."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import _resolve_admin_member
from app.mcp.auth import display_prefix, generate_api_key, hash_api_key
from app.services.supabase import supabase

logger = logging.getLogger("int.ai")

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

_LIST_COLUMNS = "id, name, key_prefix, team_member_id, created_at, last_used_at, revoked_at"


class CreateApiKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ApiKeySummary(BaseModel):
    id: str
    name: str
    key_prefix: str
    team_member_id: str
    created_at: str
    last_used_at: str | None = None
    revoked_at: str | None = None


class CreateApiKeyResponse(ApiKeySummary):
    key: str  # raw key — returned exactly once


class ListApiKeysResponse(BaseModel):
    items: list[ApiKeySummary]


@router.post("", response_model=CreateApiKeyResponse, status_code=201)
async def create_api_key(
    body: CreateApiKeyRequest,
    authorization: str = Header(...),
) -> CreateApiKeyResponse:
    member = _resolve_admin_member(authorization)
    raw_key = generate_api_key()
    try:
        row = (
            supabase.table("api_keys")
            .insert(
                {
                    "org_id": member["org_id"],
                    "team_member_id": member["id"],
                    "name": body.name.strip(),
                    "key_prefix": display_prefix(raw_key),
                    "key_hash": hash_api_key(raw_key),
                }
            )
            .execute()
            .data[0]
        )
    except Exception as exc:
        logger.exception("Failed to create API key")
        raise HTTPException(status_code=500, detail="Failed to create API key") from exc

    logger.info("API key created id=%s org=%s by=%s", row["id"], member["org_id"], member["id"])
    return CreateApiKeyResponse(key=raw_key, **{k: row.get(k) for k in ApiKeySummary.model_fields})


@router.get("", response_model=ListApiKeysResponse)
async def list_api_keys(authorization: str = Header(...)) -> ListApiKeysResponse:
    member = _resolve_admin_member(authorization)
    rows = (
        supabase.table("api_keys")
        .select(_LIST_COLUMNS)
        .eq("org_id", member["org_id"])
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return ListApiKeysResponse(items=[ApiKeySummary(**r) for r in rows])


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(key_id: str, authorization: str = Header(...)) -> None:
    member = _resolve_admin_member(authorization)
    rows = (
        supabase.table("api_keys")
        .select("id, revoked_at")
        .eq("id", key_id)
        .eq("org_id", member["org_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="API key not found")
    if rows[0].get("revoked_at"):
        return
    supabase.table("api_keys").update({"revoked_at": datetime.now(UTC).isoformat()}).eq("id", key_id).execute()
    logger.info("API key revoked id=%s by=%s", key_id, member["id"])
