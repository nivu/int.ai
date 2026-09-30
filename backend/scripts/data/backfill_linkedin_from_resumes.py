"""Backfill candidates.linkedin_url from resume text.

For every candidate with no linkedin_url, scan the raw text of their parsed
resume(s) for a linkedin.com/in/... link and store the first one found.

Usage (from backend/):
    .venv/bin/python scripts/data/backfill_linkedin_from_resumes.py            # dry run
    .venv/bin/python scripts/data/backfill_linkedin_from_resumes.py --apply    # write
    .venv/bin/python scripts/data/backfill_linkedin_from_resumes.py --apply --skip ID1,ID2
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services.supabase import supabase  # noqa: E402

LINKEDIN_RE = re.compile(
    r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/([A-Za-z0-9_\-%.]+)",
    re.IGNORECASE,
)


def extract_linkedin_url(text: str | None) -> str | None:
    if not text:
        return None
    match = LINKEDIN_RE.search(text)
    if not match:
        return None
    handle = match.group(1).rstrip(".")
    return f"https://www.linkedin.com/in/{handle}"


def main(apply: bool, skip: set[str]) -> None:
    candidates = (
        supabase.table("candidates").select("id,full_name,linkedin_url").is_("linkedin_url", "null").execute().data
        or []
    )
    if not candidates:
        print("No candidates without linkedin_url. Nothing to do.")
        return
    candidate_ids = [c["id"] for c in candidates]

    applications = (
        supabase.table("applications").select("id,candidate_id").in_("candidate_id", candidate_ids).execute().data or []
    )
    app_to_candidate = {a["id"]: a["candidate_id"] for a in applications}

    resumes = (
        supabase.table("resume_data")
        .select("application_id,raw_markdown")
        .in_("application_id", list(app_to_candidate))
        .execute()
        .data
        or []
    )

    found: dict[str, str] = {}
    for r in resumes:
        url = extract_linkedin_url(r.get("raw_markdown"))
        cid = app_to_candidate.get(r["application_id"])
        if url and cid and cid not in found:
            found[cid] = url

    name_by_id = {c["id"]: c.get("full_name") or c["id"] for c in candidates}
    print(f"Candidates missing linkedin_url: {len(candidates)}")
    print(f"Found a LinkedIn URL in resume text for: {len(found)}")
    for cid in skip:
        if found.pop(cid, None):
            print(f"  skipped (by request): {name_by_id.get(cid, cid)}")
    for cid, url in found.items():
        print(f"  {name_by_id[cid]} [{cid}]: {url}")

    if not apply:
        print("\nDry run. Re-run with --apply to write these to the database.")
        return

    updated = 0
    for cid, url in found.items():
        supabase.table("candidates").update({"linkedin_url": url}).eq("id", cid).is_("linkedin_url", "null").execute()
        updated += 1
    print(f"\nUpdated {updated} candidates.")


if __name__ == "__main__":
    skip_ids: set[str] = set()
    if "--skip" in sys.argv:
        skip_ids = set(sys.argv[sys.argv.index("--skip") + 1].split(","))
    main(apply="--apply" in sys.argv, skip=skip_ids)
