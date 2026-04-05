"""Input validation helpers for API endpoints."""

from __future__ import annotations

import re
import uuid

from fastapi import HTTPException

# ---------------------------------------------------------------------------
# File upload validation
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {"pdf", "docx"}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def validate_file_upload(filename: str, content_type: str, size: int) -> None:
    """Validate an uploaded file's extension, content type, and size.

    Raises ``HTTPException(422)`` when validation fails.
    """
    ext = filename.rsplit(".", maxsplit=1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid content type '{content_type}'.",
        )

    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=422,
            detail=f"File too large ({size} bytes). Maximum allowed: {MAX_FILE_SIZE} bytes (5 MB).",
        )


# ---------------------------------------------------------------------------
# Email validation
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def validate_email(email: str) -> None:
    """Validate basic email format.

    Raises ``HTTPException(422)`` when the email is invalid.
    """
    if not _EMAIL_RE.match(email):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid email format: '{email}'.",
        )


# ---------------------------------------------------------------------------
# UUID validation
# ---------------------------------------------------------------------------


def validate_uuid(value: str) -> None:
    """Validate that *value* is a well-formed UUID.

    Raises ``HTTPException(422)`` when the value is not a valid UUID.
    """
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid UUID: '{value}'.",
        )
