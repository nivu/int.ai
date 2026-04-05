"""Resume parsing service — extract text and structure from PDF/DOCX files."""

from __future__ import annotations

import io
import json
import logging
import time

import docx
import pdfplumber
from google import genai

from app.config import settings

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

PARSE_SYSTEM_PROMPT = """\
You are an expert resume parser. Given the raw text of a resume, extract \
structured information and return **only** valid JSON (no markdown fences) \
with the following fields:

{
  "name": "string",
  "email": "string",
  "education": [{"institution": "string", "degree": "string", "year": "string"}],
  "experience": [{"company": "string", "role": "string", "duration": "string", "description": "string"}],
  "skills": ["string"],
  "projects": [{"name": "string", "description": "string", "tech": "string"}],
  "certifications": ["string"],
  "summary": "A concise professional summary of the candidate.",
  "raw_markdown": "The full resume reformatted as clean, well-structured Markdown."
}

Rules:
- If a field cannot be determined, use an empty string or empty list as appropriate.
- Do NOT invent information that is not present in the resume.
- Return ONLY the JSON object, nothing else.
"""


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Open a PDF from raw bytes and return concatenated text from all pages."""
    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n".join(pages)


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract all paragraph text from a DOCX file provided as bytes."""
    doc = docx.Document(io.BytesIO(file_bytes))
    return "\n".join(para.text for para in doc.paragraphs if para.text.strip())


def parse_resume(raw_text: str) -> dict:
    """Send raw resume text to Google Gemini and return structured JSON."""
    client = genai.Client(api_key=settings.GEMINI_API_KEY.get_secret_value())

    start = time.time()
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=raw_text,
        config=genai.types.GenerateContentConfig(
            system_instruction=PARSE_SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    latency = time.time() - start

    usage = response.usage_metadata
    logger.info(
        "parse_resume: latency=%.2fs prompt_tokens=%s candidates_tokens=%s",
        latency,
        getattr(usage, "prompt_token_count", None),
        getattr(usage, "candidates_token_count", None),
    )

    return json.loads(response.text)


def process_resume(file_bytes: bytes, filename: str) -> dict:
    """Determine file format, extract text, parse with Gemini, and return structured data."""
    extension = filename.rsplit(".", maxsplit=1)[-1].lower() if "." in filename else ""

    if extension == "pdf":
        raw_text = extract_text_from_pdf(file_bytes)
    elif extension in ("docx", "doc"):
        raw_text = extract_text_from_docx(file_bytes)
    else:
        raise ValueError(f"Unsupported resume format: .{extension}")

    if not raw_text.strip():
        raise ValueError("Could not extract any text from the resume file.")

    parsed = parse_resume(raw_text)
    parsed["raw_text"] = raw_text
    return parsed
