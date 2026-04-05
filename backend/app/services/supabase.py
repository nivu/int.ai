"""Supabase client and helper functions for backend operations.

Uses the service-role key so all queries bypass Row-Level Security.
"""

from __future__ import annotations

from typing import Any

from supabase import Client, create_client

from app.config import settings

# ---------------------------------------------------------------------------
# Client initialisation (service-role — bypasses RLS)
# ---------------------------------------------------------------------------
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY.get_secret_value(),
)


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

def get_record(table: str, record_id: str) -> dict[str, Any]:
    """Fetch a single record by its ``id`` column.

    Raises an exception via the Supabase client if the record is not found.
    """
    response = supabase.table(table).select("*").eq("id", record_id).single().execute()
    return response.data


def insert_record(table: str, data: dict[str, Any]) -> dict[str, Any]:
    """Insert a new row and return the created record."""
    response = supabase.table(table).insert(data).execute()
    return response.data[0]


def update_record(table: str, record_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update an existing row by ``id`` and return the updated record."""
    response = supabase.table(table).update(data).eq("id", record_id).execute()
    return response.data[0]


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def upload_file(
    bucket: str,
    path: str,
    file_bytes: bytes,
    content_type: str,
) -> dict[str, Any]:
    """Upload a file to a Supabase Storage bucket.

    Parameters
    ----------
    bucket:
        The storage bucket name.
    path:
        Destination path inside the bucket (e.g. ``"resumes/abc123.pdf"``).
    file_bytes:
        Raw file content.
    content_type:
        MIME type (e.g. ``"application/pdf"``).
    """
    response = supabase.storage.from_(bucket).upload(
        path,
        file_bytes,
        file_options={"content-type": content_type},
    )
    return response


def get_signed_url(
    bucket: str,
    path: str,
    expires_in: int = 3600,
) -> str:
    """Generate a time-limited signed URL for a private file.

    Parameters
    ----------
    bucket:
        The storage bucket name.
    path:
        File path inside the bucket.
    expires_in:
        Seconds until the URL expires (default 1 hour).
    """
    response = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    return response["signedURL"]
