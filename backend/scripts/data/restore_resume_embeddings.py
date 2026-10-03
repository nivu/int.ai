"""Restore resume_data.embedding cleared by migration 030 on 2026-10-02.

For every resume_data row with no embedding, re-download the original resume,
extract its text exactly as screening does, embed it with the same model, and
store it. Also fills resume_data.resume_text where empty. Touches nothing else:
no scores, statuses or emails.

Usage (from backend/):
    .venv/bin/python scripts/data/restore_resume_embeddings.py            # dry run
    .venv/bin/python scripts/data/restore_resume_embeddings.py --apply    # write
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services.embeddings import embed_text  # noqa: E402
from app.services.supabase import supabase  # noqa: E402
from app.services.usage import reset_usage_context, set_usage_context  # noqa: E402
from app.tasks.screen_resume import download_resume_text  # noqa: E402


def main(apply: bool) -> None:
    rows = (
        supabase.table("resume_data")
        .select("id, application_id, resume_text, applications(resume_url, hiring_post_id, hiring_posts(org_id))")
        .is_("embedding", "null")
        .execute()
        .data
        or []
    )
    print(f"{len(rows)} resume_data rows without an embedding")
    restored, failed = 0, []
    for row in rows:
        app = row.get("applications") or {}
        resume_url = app.get("resume_url")
        if not resume_url:
            failed.append((row["application_id"], "no resume_url"))
            continue
        if not apply:
            print(f"  would restore application={row['application_id']} from {resume_url}")
            continue
        token = set_usage_context(
            org_id=(app.get("hiring_posts") or {}).get("org_id"),
            hiring_post_id=app.get("hiring_post_id"),
            application_id=row["application_id"],
        )
        try:
            text = download_resume_text(resume_url)
            patch: dict = {"embedding": embed_text(text)}
            if not row.get("resume_text"):
                patch["resume_text"] = text
            supabase.table("resume_data").update(patch).eq("id", row["id"]).execute()
            restored += 1
        except Exception as exc:  # keep going; report at the end
            failed.append((row["application_id"], f"{type(exc).__name__}: {exc}"[:120]))
        finally:
            reset_usage_context(token)

    if apply:
        print(f"restored {restored} of {len(rows)}")
    for app_id, reason in failed:
        print(f"  skipped application={app_id}: {reason}")
    if apply and failed:
        sys.exit(f"{len(failed)} rows not restored")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
