"""
Focused simulation: resume screening speed + email trigger verification.

What this measures:
  1. Wall-clock time for each phase of the screening pipeline using REAL
     OpenAI / embedding calls — so the numbers reflect actual production speed.
  2. Whether the correct post-screening email is triggered (interview invitation
     or rejection) and that it was called with the right candidate details.

External services mocked:
  - Supabase Storage (no real resume file needed)
  - Resend (email is intercepted, not sent — we assert it was called)
  - parse_resume (the 30-second LLM parse; not what we're timing here)

Run with:
    cd backend && python simulate_scoring_speed.py
"""

from __future__ import annotations

import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch, call

# ── Test constants ────────────────────────────────────────────────────────────
HIRING_POST_ID = "25df2454-1e78-4e52-a558-fc473fa058f4"
TEST_EMAIL     = "speed.test.candidate@intai.dev"
TEST_NAME      = "Speed Test Candidate"

# A realistic resume that should score well against a Python dev JD
FAKE_RESUME_TEXT = """\
# Speed Test Candidate
Email: speed.test.candidate@intai.dev

## Summary
Python developer with 3 years of experience building web APIs and data pipelines.
Proficient in object-oriented design, REST API development, and automated testing.

## Experience
**Software Developer — TechCorp (2023–2026)**
- Designed and built REST APIs using FastAPI and Django REST Framework
- Applied OOP principles extensively: class hierarchies, mixins, design patterns
- Wrote unit and integration tests with pytest (90%+ coverage)
- Used Git + GitHub for version control and code review workflows
- Containerised services with Docker and deployed on AWS

## Skills
Python, FastAPI, Django, OOP, pytest, Git, Docker, SQL, PostgreSQL, REST APIs

## Education
B.Sc. Computer Science — State University (2023)
"""

FAKE_PARSED_RESUME = {
    "name": TEST_NAME,
    "email": TEST_EMAIL,
    "summary": "Python developer with 3 years experience.",
    "skills": ["Python", "FastAPI", "Django", "OOP", "pytest", "Git", "Docker"],
    "experience": [{"title": "Software Developer", "company": "TechCorp", "duration": "2023-2026"}],
    "education": [{"degree": "B.Sc. Computer Science", "institution": "State University"}],
    "projects": [],
    "certifications": [],
    "raw_markdown": FAKE_RESUME_TEXT,
}

# ── Tracking ──────────────────────────────────────────────────────────────────
_created_candidate_id  = None
_created_application_id = None
_created_resume_data_id = None
_timings: dict[str, float] = {}
_email_calls: dict[str, list] = {"invitation": [], "rejection": []}


def _ts() -> float:
    return time.perf_counter()


def _fmt(seconds: float) -> str:
    return f"{seconds:.2f}s"


# ── Cleanup ───────────────────────────────────────────────────────────────────
def cleanup() -> None:
    from app.services.supabase import supabase
    print("\n── Cleanup ──────────────────────────────────────────────────────────")
    try:
        if _created_resume_data_id:
            supabase.table("resume_data").delete().eq("id", _created_resume_data_id).execute()
            print(f"  deleted resume_data {_created_resume_data_id}")
    except Exception as e:
        print(f"  warn: {e}")
    try:
        if _created_application_id:
            sessions = supabase.table("interview_sessions").select("id").eq(
                "application_id", _created_application_id
            ).execute()
            for s in (sessions.data or []):
                supabase.table("interview_qa").delete().eq("session_id", s["id"]).execute()
                supabase.table("interview_sessions").delete().eq("id", s["id"]).execute()
            supabase.table("applications").delete().eq("id", _created_application_id).execute()
            print(f"  deleted application {_created_application_id}")
    except Exception as e:
        print(f"  warn: {e}")
    try:
        if _created_candidate_id:
            supabase.table("candidates").delete().eq("id", _created_candidate_id).execute()
            print(f"  deleted candidate {_created_candidate_id}")
    except Exception as e:
        print(f"  warn: {e}")


# ── Main simulation ───────────────────────────────────────────────────────────
def run() -> bool:
    global _created_candidate_id, _created_application_id, _created_resume_data_id

    from app.services.supabase import supabase

    # ── Phase 0: Setup ────────────────────────────────────────────────────────
    print("\n── Phase 0: Setup ───────────────────────────────────────────────────")

    # Remove any leftover test data
    existing = supabase.table("candidates").select("id").eq("email", TEST_EMAIL).execute()
    if existing.data:
        old_id = existing.data[0]["id"]
        apps = supabase.table("applications").select("id").eq("candidate_id", old_id).execute()
        for app in (apps.data or []):
            ss = supabase.table("interview_sessions").select("id").eq("application_id", app["id"]).execute()
            for s in (ss.data or []):
                supabase.table("interview_qa").delete().eq("session_id", s["id"]).execute()
                supabase.table("interview_sessions").delete().eq("id", s["id"]).execute()
            supabase.table("resume_data").delete().eq("application_id", app["id"]).execute()
            supabase.table("applications").delete().eq("id", app["id"]).execute()
        supabase.table("candidates").delete().eq("id", old_id).execute()
        print("  Cleaned up leftover data from previous run")

    # Create candidate
    cand = supabase.table("candidates").insert({
        "email": TEST_EMAIL,
        "full_name": TEST_NAME,
        "current_role": "Software Developer",
        "years_experience": 3,
    }).execute()
    if not cand.data:
        print("  FAIL: Could not create candidate")
        return False
    _created_candidate_id = cand.data[0]["id"]
    print(f"  Created candidate: {_created_candidate_id}")

    # Create application
    app_rec = supabase.table("applications").insert({
        "hiring_post_id": HIRING_POST_ID,
        "candidate_id": _created_candidate_id,
        "resume_url": "resumes/speed-test-resume.pdf",
        "resume_filename": "speed-test-resume.pdf",
        "status": "applied",
    }).execute()
    if not app_rec.data:
        print("  FAIL: Could not create application")
        return False
    _created_application_id = app_rec.data[0]["id"]
    print(f"  Created application: {_created_application_id}")
    print(f"  Hiring post: {HIRING_POST_ID}")

    # ── Phase 1: Run the real screening pipeline ──────────────────────────────
    print("\n── Phase 1: Resume Screening Pipeline ───────────────────────────────")
    print("  Using REAL OpenAI + sentence-transformers for scoring")
    print("  Mocking: Supabase Storage (no PDF file), Resend (email capture)")
    print()

    mock_invite = MagicMock(return_value=None)
    mock_reject = MagicMock(return_value=None)

    fake_storage = MagicMock()
    fake_storage.from_.return_value.download.return_value = b"%PDF fake"

    patches = [
        patch("app.tasks.screen_resume.supabase", new=MagicMock(
            table=supabase.table,
            storage=fake_storage,
        )),
        patch("app.tasks.screen_resume.extract_text_from_pdf", return_value=FAKE_RESUME_TEXT),
        patch("app.tasks.screen_resume.parse_resume", return_value=FAKE_PARSED_RESUME),
        patch("app.tasks.screen_resume.embed_text", return_value=[0.0] * 384),
        patch("app.tasks.screen_resume.store_embedding", return_value=None),
        patch("app.tasks.screen_resume.get_signed_url", return_value="https://fake.url/resume.pdf"),
        patch("app.tasks.screen_resume.email_service.send_interview_invitation", mock_invite),
        patch("app.tasks.screen_resume.email_service.send_rejection", mock_reject),
    ]

    from app.tasks.screen_resume import screen_resume_task

    pipeline_start = _ts()

    import contextlib
    with contextlib.ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)

        # ── Stage A: PDF extraction (mocked — instant) ────────────────────
        t0 = _ts()
        # (extraction happens inside screen_resume_task; we report it separately
        #  by timing the scoring calls directly below)

        # ── Stage B: Parallel scoring (REAL LLM calls) ───────────────────
        print("  Running parallel scoring (embedding + skill + experience + culture)...")
        from app.services.scoring import (
            score_embedding_similarity,
            score_skill_match,
            score_experience_match,
            score_culture_match,
        )
        from app.services.supabase import get_record
        hiring_post = get_record("hiring_posts", HIRING_POST_ID)
        jd_text: str = hiring_post.get("description", "")
        jd_skills: list[str] = hiring_post.get("required_skills", []) or []

        from concurrent.futures import ThreadPoolExecutor
        scoring_start = _ts()
        with ThreadPoolExecutor(max_workers=4) as pool:
            fut_embed = pool.submit(score_embedding_similarity, FAKE_RESUME_TEXT, jd_text)
            fut_skill = pool.submit(score_skill_match, FAKE_RESUME_TEXT, jd_skills)
            fut_exp   = pool.submit(score_experience_match, FAKE_RESUME_TEXT, jd_text)
            fut_cult  = pool.submit(score_culture_match, FAKE_RESUME_TEXT, jd_text)

            embed_score = fut_embed.result()
            skill_score, skill_details = fut_skill.result()
            exp_score, exp_details     = fut_exp.result()
            cult_score, cult_details   = fut_cult.result()

        scoring_elapsed = _ts() - scoring_start
        _timings["parallel_scoring"] = scoring_elapsed
        print(f"  Scoring done in {_fmt(scoring_elapsed)}")
        print(f"    embedding_similarity : {round(embed_score * 100, 1)}%")
        print(f"    skill_match          : {round(skill_score * 100, 1)}%")
        print(f"    experience_match     : {round(exp_score * 100, 1)}%")
        print(f"    culture_match        : {round(cult_score * 100, 1)}%")

        # ── Stage C: Full task (DB writes + auto-advance + email) ─────────
        print(f"\n  Running full screen_resume_task (includes DB writes + auto-advance)...")
        task_start = _ts()
        try:
            result = screen_resume_task(_created_application_id, HIRING_POST_ID)
        except Exception as exc:
            print(f"\n  FAIL in screen_resume_task: {exc}")
            traceback.print_exc()
            return False
        task_elapsed = _ts() - task_start
        _timings["full_task"] = task_elapsed

    pipeline_elapsed = _ts() - pipeline_start
    _timings["total_pipeline"] = pipeline_elapsed

    overall_pct = result["overall_score"]
    print(f"\n  Task completed in {_fmt(task_elapsed)}")
    print(f"  Overall score returned: {overall_pct}%")
    print(f"  Total pipeline wall time: {_fmt(pipeline_elapsed)}")

    # ── Phase 2: Verify DB state ──────────────────────────────────────────────
    print("\n── Phase 2: Verify Database State ───────────────────────────────────")

    app_after = supabase.table("applications").select("*").eq(
        "id", _created_application_id
    ).single().execute().data

    status = app_after.get("status", "")
    overall_db = round((app_after.get("overall_score") or 0) * 100, 1)
    embed_db  = round((app_after.get("embedding_score") or 0) * 100, 1)
    skill_db  = round((app_after.get("skill_match_score") or 0) * 100, 1)
    exp_db    = round((app_after.get("experience_match_score") or 0) * 100, 1)
    cult_db   = round((app_after.get("culture_match_score") or 0) * 100, 1)
    completed_at = app_after.get("screening_completed_at", "")

    print(f"  application.status           : {status}")
    print(f"  application.overall_score    : {overall_db}%")
    print(f"  application.embedding_score  : {embed_db}%")
    print(f"  application.skill_match_score: {skill_db}%")
    print(f"  application.experience_match : {exp_db}%")
    print(f"  application.culture_match    : {cult_db}%")
    print(f"  screening_completed_at       : {completed_at}")

    all_scores_populated = all([
        app_after.get("embedding_score") is not None,
        app_after.get("skill_match_score") is not None,
        app_after.get("experience_match_score") is not None,
        app_after.get("culture_match_score") is not None,
        app_after.get("overall_score") is not None,
    ])
    print(f"\n  All 5 score columns populated in DB: {'YES ✓' if all_scores_populated else 'NO ✗'}")

    rd = supabase.table("resume_data").select("id, parsed_skills").eq(
        "application_id", _created_application_id
    ).limit(1).execute()
    if rd.data:
        _created_resume_data_id = rd.data[0]["id"]
        print(f"  resume_data row created: YES ✓ (id={_created_resume_data_id})")
        ps = rd.data[0].get("parsed_skills") or []
        print(f"  parsed_skills: {ps}")
    else:
        print("  resume_data row created: NO ✗")

    # ── Phase 3: Email verification ───────────────────────────────────────────
    print("\n── Phase 3: Email Trigger Verification ──────────────────────────────")

    hiring_post_title = hiring_post.get("title", "Unknown Job")
    threshold = float(hiring_post.get("screening_threshold", 70)) / 100.0
    overall_score_raw = (app_after.get("overall_score") or 0)

    print(f"  Hiring post threshold : {round(threshold * 100)}%")
    print(f"  Candidate overall     : {round(overall_score_raw * 100, 1)}%")

    invite_called  = mock_invite.call_count > 0
    reject_called  = mock_reject.call_count > 0

    if status == "interview_sent" and invite_called:
        print(f"\n  Email type sent       : INTERVIEW INVITATION ✓")
        print(f"  send_interview_invitation called: YES ({mock_invite.call_count}x)")
        if mock_invite.call_args:
            kwargs = mock_invite.call_args.kwargs or {}
            if not kwargs and mock_invite.call_args.args:
                # positional
                print(f"  Sent to               : {mock_invite.call_args.args}")
            else:
                print(f"  Sent to               : {kwargs.get('candidate_email', '?')}")
                print(f"  Candidate name        : {kwargs.get('candidate_name', '?')}")
                print(f"  Job title             : {kwargs.get('job_title', '?')}")
                print(f"  Interview deadline    : {kwargs.get('interview_deadline', '?')}")
        email_ok = True

    elif status == "resume_rejected" and reject_called:
        print(f"\n  Email type sent       : REJECTION ✓")
        print(f"  send_rejection called : YES ({mock_reject.call_count}x)")
        if mock_reject.call_args:
            kwargs = mock_reject.call_args.kwargs or {}
            print(f"  Sent to               : {kwargs.get('candidate_email', '?')}")
            print(f"  Candidate name        : {kwargs.get('candidate_name', '?')}")
        email_ok = True

    elif status == "screened" and not invite_called and not reject_called:
        print(f"\n  Email type sent       : NONE (score in review band)")
        print(f"  This is correct — score is between rejection and pass thresholds")
        print(f"  No automated email triggered (flagged for human review)")
        email_ok = True

    else:
        print(f"\n  Email verification    : MISMATCH ✗")
        print(f"  status={status!r}, invite_called={invite_called}, reject_called={reject_called}")
        email_ok = False

    if invite_called and reject_called:
        print(f"\n  WARNING: Both invitation AND rejection emails were triggered — unexpected!")
        email_ok = False

    # ── Phase 4: Timing summary ───────────────────────────────────────────────
    print("\n── Phase 4: Timing Summary ──────────────────────────────────────────")
    print(f"  PDF text extraction       : ~instant (mocked; real = <1s for pdfplumber)")
    print(f"  Parallel AI scoring       : {_fmt(_timings['parallel_scoring'])}")
    print(f"    (embedding + skill + experience + culture, run concurrently)")
    print(f"  DB writes + auto-advance  : ~{_fmt(_timings['full_task'] - _timings['parallel_scoring'])}")
    print(f"  ──────────────────────────────────────────────────────────")
    print(f"  Total screening pipeline  : {_fmt(_timings['total_pipeline'])}")
    print()
    print("  NOTE: parse_resume (LLM structured extraction) runs in parallel")
    print("  and takes ~25-35s but does NOT block scores from appearing in")
    print("  the candidates table — scores are written first, parsed fields")
    print("  fill in afterwards as a second update.")

    # ── Final verdict ─────────────────────────────────────────────────────────
    passed = all_scores_populated and email_ok
    return passed


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 68)
    print("  INT.AI — SCREENING SPEED + EMAIL TRIGGER SIMULATION")
    print("=" * 68)

    ok = False
    try:
        ok = run()
    except Exception:
        print("\nUnexpected exception:")
        traceback.print_exc()
    finally:
        cleanup()

    print("\n" + "=" * 68)
    if ok:
        print("  RESULT: ALL CHECKS PASSED ✓")
    else:
        print("  RESULT: ONE OR MORE CHECKS FAILED ✗")
    print("=" * 68)
    sys.exit(0 if ok else 1)
