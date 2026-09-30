"""API-key authentication for the hosted MCP server.

Keys look like ``intai_<40 url-safe chars>``. Only a SHA-256 hash is stored in
``api_keys``; the raw key is returned once at creation and never again.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import UTC, datetime

from mcp.server.auth.provider import AccessToken

logger = logging.getLogger("int.ai")

KEY_PREFIX = "intai_"
MCP_SCOPE = "intai:mcp"


def generate_api_key() -> str:
    """Return a new raw API key."""
    return KEY_PREFIX + secrets.token_urlsafe(30)


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def display_prefix(raw_key: str) -> str:
    """The short, non-secret prefix shown in the UI to identify a key."""
    return raw_key[: len(KEY_PREFIX) + 6]


class ApiKeyVerifier:
    """``TokenVerifier`` implementation backed by the ``api_keys`` table."""

    async def verify_token(self, token: str) -> AccessToken | None:
        if not token.startswith(KEY_PREFIX):
            return None

        from app.services.supabase import supabase as sb

        try:
            rows = (
                sb.table("api_keys")
                .select("id, org_id, team_member_id, revoked_at")
                .eq("key_hash", hash_api_key(token))
                .limit(1)
                .execute()
                .data
                or []
            )
        except Exception:
            logger.exception("API key lookup failed")
            return None

        if not rows or rows[0].get("revoked_at"):
            return None
        key = rows[0]

        try:
            sb.table("api_keys").update({"last_used_at": datetime.now(UTC).isoformat()}).eq("id", key["id"]).execute()
        except Exception:
            logger.warning("Could not update last_used_at for api key %s", key["id"])

        return AccessToken(
            token=token,
            client_id=key["id"],
            scopes=[MCP_SCOPE],
            subject=key["team_member_id"],
            claims={
                "org_id": key["org_id"],
                "team_member_id": key["team_member_id"],
                "api_key_id": key["id"],
            },
        )
