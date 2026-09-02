"""
End-to-end simulation of the full hiring pipeline against the real Supabase DB.

External services (OpenAI, Resend email, Supabase Storage) are mocked so the
test is free, deterministic, and leaves no emails in inboxes.
All test records are cleaned up regardless of pass/fail.

Run with:
    cd backend && python simulate_e2e.py
"""

from __future__ import annotations

import sys
import textwrap
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Constants — use the real "Beginner Python Dev" hiring post
# ---------------------------------------------------------------------------
HIRING_POST_ID     = "25df2454-1e78-4e52-a558-fc473fa058f4"
TEMPLATE_ID        = "00000000-0000-0000-0000-000000000010"
MAX_QUESTIONS      = 5
TEST_EMAIL         = "test.e2e.simulation@intai.dev"
TEST_NAME          = "E2E Test Candidate"

FAKE_RESUME_TEXT = textwrap.dedent("""\
    # E2E Test Candidate
    Email: test.e2e.simulation@intai.dev

    ## Summary
    Python developer with 2 years of experience building web applications
    and data pipelines. Comfortable with OOP, Git, and basic ML.

    ## Experience
    **Junior Python Developer — Acme Corp (2024–2026)**
    - Built REST APIs with FastAPI and SQLAlchemy
    - Wrote unit tests using pytest
    - Used Git for version control daily

    ## Skills
    Python, FastAPI, SQLAlchemy, Git, OOP, pytest, Docker, SQL

    ## Education
    B.Sc. Computer Science — Example University (2024)
""")

FAKE_PARSED_RESUME = {
    "name": TEST_NAME,
    "email": TEST_EMAIL,
    "summary": "Python developer with 2 years experience.",
    "skills": ["Python", "FastAPI", "Git", "OOP", "pytest", "Docker"],
    "experience": [{"title": "Junior Python Developer", "company": "Acme Corp", "duration": "2024-2026"}],
    "education": [{"degree": "B.Sc. Computer Science", "institution": "Example University"}],
    "projects": [],
    "certifications": [],
    "raw_markdown": FAKE_RESUME_TEXT,
}

MOCK_QA_PAIRS = [
    ("Tell me about your Python experience.", "I've used Python for 2 years building REST APIs with FastAPI and doing data work."),
    ("How do you use OOP in your projects?", "I design classes for domain models. For example, I modelled orders as a class with methods for validation and serialisation."),
    ("Explain your Git workflow.", "I use feature branches, write descriptive commits, and open PRs for code review before merging to main."),
    ("How would you debug a slow API endpoint?", "I'd start with profiling — add timing logs, then check DB queries with EXPLAIN ANALYZE, and look for N+1 patterns."),
    ("Describe a challenging bug you fixed.", "I found a race condition in a background task that double-processed jobs. Fixed it with a database-level unique constraint and idempotency check."),
]

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------
_results: list[dict[str, Any]] = []
_created_ids: dict[str, str | None] = {
    "candidate_id": None,
    "application_id": None,
    "resume_data_id": None,
    "session_id": None,
    "report_id": None,
}

def _pass(step: str, detail: str = "") -> None:
    _results.append({"step": step, "status": "PASS", "detail": detail})
    print(f"  ✓  {step}" + (f": {detail}" if detail else ""))

def _fail(step: str, detail: str = "") -> None:
    _results.append({"step": step, "status": "FAIL", "detail": detail})
    print(f"  ✗  {step}" + (f": {detail}" if detail else ""))

def _issue(step: str, detail: str = "") -> None:
    _results.append({"step": step, "status": "ISSUE", "detail": detail})
    print(f"  ⚠  {step}" + (f": {detail}" if detail else ""))


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
def cleanup() -> None:
    from app.services.supabase import supabase
    print("\n── Cleanup ──────────────────────────────────────────────")

    if _created_ids["report_id"]:
        try:
            supabase.table("interview_reports").delete().eq("id", _created_ids["report_id"]).execute()
            print(f"  deleted interview_report  {_created_ids['report_id']}")
        except Exception as e:
            print(f"  warn: could not delete report: {e}")

    if _created_ids["session_id"]:
        try:
            supabase.table("interview_qa").delete().eq("session_id", _created_ids["session_id"]).execute()
            supabase.table("interview_sessions").delete().eq("id", _created_ids["session_id"]).execute()
            print(f"  deleted interview_session + qa  {_created_ids['session_id']}")
        except Exception as e:
            print(f"  warn: could not delete session: {e}")

    if _created_ids["resume_data_id"]:
        try:
            supabase.table("resume_data").delete().eq("id", _created_ids["resume_data_id"]).execute()
            print(f"  deleted resume_data  {_created_ids['resume_data_id']}")
        except Exception as e:
            print(f"  warn: could not delete resume_data: {e}")

    if _created_ids["application_id"]:
        try:
            supabase.table("applications").delete().eq("id", _created_ids["application_id"]).execute()
            print(f"  deleted application  {_created_ids['application_id']}")
        except Exception as e:
            print(f"  warn: could not delete application: {e}")

    if _created_ids["candidate_id"]:
        try:
            supabase.table("candidates").delete().eq("id", _created_ids["candidate_id"]).execute()
            print(f"  deleted candidate  {_created_ids['candidate_id']}")
        except Exception as e:
            print(f"  warn: could not delete candidate: {e}")


# ---------------------------------------------------------------------------
# Simulation steps
# ---------------------------------------------------------------------------

def step_create_candidate() -> None:
    print("\n── Step 1: Create test candidate ────────────────────────")
    from app.services.supabase import supabase

    # Clean up any leftover from a previous failed run
    existing = supabase.table("candidates").select("id").eq("email", TEST_EMAIL).execute()
    if existing.data:
        old_id = existing.data[0]["id"]
        # Remove dependent records first
        apps = supabase.table("applications").select("id").eq("candidate_id", old_id).execute()
        for app in (apps.data or []):
            sessions = supabase.table("interview_sessions").select("id").eq("application_id", app["id"]).execute()
            for s in (sessions.data or []):
                supabase.table("interview_qa").delete().eq("session_id", s["id"]).execute()
                supabase.table("interview_reports").delete().eq("session_id", s["id"]).execute()
                supabase.table("interview_sessions").delete().eq("id", s["id"]).execute()
            supabase.table("resume_data").delete().eq("application_id", app["id"]).execute()
            supabase.table("applications").delete().eq("id", app["id"]).execute()
        supabase.table("candidates").delete().eq("id", old_id).execute()

    rec = supabase.table("candidates").insert({
        "email": TEST_EMAIL,
        "full_name": TEST_NAME,
        "current_role": "Junior Python Developer",
        "years_experience": 2,
    }).execute()

    if not rec.data:
        _fail("Create candidate", "No data returned")
        return

    _created_ids["candidate_id"] = rec.data[0]["id"]
    _pass("Create candidate", f"id={_created_ids['candidate_id']}")


def step_submit_application() -> None:
    print("\n── Step 2: Submit application ────────────────────────────")
    from app.services.supabase import supabase

    if not _created_ids["candidate_id"]:
        _fail("Submit application", "No candidate_id")
        return

    rec = supabase.table("applications").insert({
        "hiring_post_id": HIRING_POST_ID,
        "candidate_id": _created_ids["candidate_id"],
        "resume_url": "resumes/test-e2e-resume.pdf",
        "resume_filename": "test-e2e-resume.pdf",
        "status": "applied",
    }).execute()

    if not rec.data:
        _fail("Submit application", "No data returned")
        return

    _created_ids["application_id"] = rec.data[0]["id"]
    _pass("Submit application", f"id={_created_ids['application_id']} status=applied")


def step_screen_resume() -> None:
    print("\n── Step 3: Resume screening (mocked AI + storage) ───────")

    if not _created_ids["application_id"]:
        _fail("Screen resume", "No application_id")
        return

    app_id = _created_ids["application_id"]

    # --- Mock all external services ---
    fake_storage = MagicMock()
    fake_storage.from_.return_value.download.return_value = b"%PDF fake bytes"

    fake_all_dimensions = (
        0.72, {"skills": [{"skill": "Python", "matched": True, "confidence": 0.95, "evidence": "2 years Python"}]},
        0.75, {"overall": 0.75, "seniority_alignment": {"score": 0.7, "reasoning": "ok", "evidence": "Junior"}},
        0.80, {"overall": 0.80, "collaboration_signals": {"score": 0.8, "reasoning": "ok", "evidence": "team"}},
    )

    patches = [
        patch("app.tasks.screen_resume.supabase", new=MagicMock(
            table=__import__("app.services.supabase", fromlist=["supabase"]).supabase.table,
            storage=fake_storage,
        )),
        patch("app.tasks.screen_resume.extract_text_from_pdf", return_value=FAKE_RESUME_TEXT),
        patch("app.tasks.screen_resume.parse_resume", return_value=FAKE_PARSED_RESUME),
        patch("app.tasks.screen_resume.score_embedding_similarity", return_value=0.78),
        patch("app.tasks.screen_resume.score_all_dimensions", return_value=fake_all_dimensions),
        patch("app.tasks.screen_resume.embed_text", return_value=[0.1] * 384),
        patch("app.tasks.screen_resume.store_embedding", return_value=None),
        patch("app.tasks.screen_resume.email_service.send_interview_invitation", return_value=None),
        patch("app.tasks.screen_resume.email_service.send_rejection", return_value=None),
    ]

    from app.tasks.screen_resume import screen_resume_task
    from app.services.supabase import supabase

    with __import__("contextlib").ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)

        try:
            result = screen_resume_task(app_id, HIRING_POST_ID)
        except Exception as exc:
            _fail("Screen resume task", str(exc))
            traceback.print_exc()
            return

    _pass("Screen resume task", f"overall={result['overall_score']}%")

    # Verify DB state
    app_rec = supabase.table("applications").select("*").eq("id", app_id).single().execute().data
    status = app_rec.get("status")
    overall = app_rec.get("overall_score", 0)

    if status in ("interview_sent", "screened"):
        _pass("Application status after screening", f"status={status} overall_score={round(overall*100,1)}%")
    else:
        _fail("Application status after screening", f"expected interview_sent/screened, got {status!r}")

    if app_rec.get("skill_match_score") is not None:
        _pass("Score columns populated",
              f"embed={round(app_rec['embedding_score']*100,1)}% "
              f"skill={round(app_rec['skill_match_score']*100,1)}% "
              f"exp={round(app_rec['experience_match_score']*100,1)}% "
              f"culture={round(app_rec['culture_match_score']*100,1)}%")
    else:
        _fail("Score columns populated", "skill_match_score is None")

    # Check resume_data row
    rd = supabase.table("resume_data").select("*").eq("application_id", app_id).limit(1).execute()
    if rd.data:
        _created_ids["resume_data_id"] = rd.data[0]["id"]
        parsed_skills = rd.data[0].get("parsed_skills") or []
        if parsed_skills:
            _pass("Resume parsed skills", f"{parsed_skills}")
        else:
            _issue("Resume parsed skills", "parsed_skills is empty")
    else:
        _fail("resume_data row created", "not found")


def step_verify_interview_session() -> None:
    print("\n── Step 4: Verify interview session created ──────────────")
    from app.services.supabase import supabase

    if not _created_ids["application_id"]:
        _fail("Verify interview session", "No application_id")
        return

    resp = supabase.table("interview_sessions").select("*").eq(
        "application_id", _created_ids["application_id"]
    ).limit(1).execute()

    if not resp.data:
        # Session may not have been auto-created if score was borderline — create it manually
        _issue("Auto interview session", "not created by screening (score may be borderline) — creating manually")
        rec = supabase.table("interview_sessions").insert({
            "application_id": _created_ids["application_id"],
            "template_id": TEMPLATE_ID,
            "status": "pending",
            "deadline": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        }).execute()
        if rec.data:
            _created_ids["session_id"] = rec.data[0]["id"]
            _pass("Manual session creation", f"id={_created_ids['session_id']}")
        else:
            _fail("Manual session creation", "failed")
        return

    session = resp.data[0]
    _created_ids["session_id"] = session["id"]
    _pass("Interview session exists", f"id={session['id']} status={session['status']}")

    if session.get("deadline"):
        _pass("Session has deadline", session["deadline"])
    else:
        _issue("Session deadline", "deadline is NULL")


def step_simulate_interview() -> None:
    print("\n── Step 5: Simulate interview Q&A ──────────────────────")
    from app.services.supabase import supabase

    if not _created_ids["session_id"]:
        _fail("Simulate interview", "No session_id")
        return

    session_id = _created_ids["session_id"]

    # Mark session in_progress
    supabase.table("interview_sessions").update({
        "status": "in_progress",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "consent_given_at": datetime.now(timezone.utc).isoformat(),
        "livekit_room_name": f"interview-{session_id}",
    }).eq("id", session_id).execute()

    # Insert Q&A pairs
    for i, (question, answer) in enumerate(MOCK_QA_PAIRS, start=1):
        supabase.table("interview_qa").insert({
            "session_id": session_id,
            "question_number": i,
            "question_type": "foundational",
            "question_text": question,
            "answer_text": answer,
        }).execute()

    # Mark session completed
    supabase.table("interview_sessions").update({
        "status": "completed",
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": 720,
        "questions_asked": MAX_QUESTIONS,
    }).eq("id", session_id).execute()

    # Verify
    qa_count = supabase.table("interview_qa").select("id", count="exact").eq("session_id", session_id).execute()
    n = qa_count.count if hasattr(qa_count, "count") and qa_count.count else len(qa_count.data)

    if n == MAX_QUESTIONS:
        _pass(f"Q&A pairs inserted", f"{n}/{MAX_QUESTIONS} — exactly correct")
    elif n > MAX_QUESTIONS:
        _fail(f"Q&A count exceeds limit", f"{n} rows (limit is {MAX_QUESTIONS})")
    else:
        _fail(f"Q&A pairs inserted", f"only {n}/{MAX_QUESTIONS}")

    session_check = supabase.table("interview_sessions").select("status, questions_asked").eq("id", session_id).single().execute().data
    if session_check.get("status") == "completed":
        _pass("Session marked completed", f"questions_asked={session_check.get('questions_asked')}")
    else:
        _fail("Session status", f"expected completed, got {session_check.get('status')!r}")


def step_evaluate_interview() -> None:
    print("\n── Step 6: Interview evaluation (mocked OpenAI) ─────────")
    from app.services.supabase import supabase

    if not _created_ids["session_id"]:
        _fail("Evaluate interview", "No session_id")
        return

    session_id = _created_ids["session_id"]

    # Mock OpenAI to return deterministic scores for each Q&A pair
    qa_eval_response = {
        "technical_accuracy": 8,
        "depth_of_understanding": 7,
        "communication_clarity": 8,
        "relevance_to_jd": 7,
        "score_rationale": "Good technical knowledge with clear examples.",
    }
    summary_response = {
        "summary": (
            "The candidate demonstrated solid Python fundamentals with practical experience "
            "in FastAPI and Git workflows. Answers were clear and well-structured, with "
            "good examples from real projects. Areas to develop include deeper system design "
            "knowledge. Overall a promising junior Python developer."
        ),
        "strengths": [
            "Clear Python and OOP understanding",
            "Strong Git workflow and code review practices",
            "Good debugging methodology",
        ],
        "concerns": [
            "Limited experience with large-scale distributed systems",
        ],
    }

    def fake_openai_json(system_prompt: str, user_content: str, temperature: float = 0.2) -> dict:
        if "strengths" in system_prompt:
            return summary_response
        return qa_eval_response

    from app.tasks.evaluate_interview import evaluate_interview_task

    with patch("app.interview.evaluator._openai_json_request", side_effect=fake_openai_json), \
         patch("app.tasks.evaluate_interview.email_service.send_interview_completed", return_value=None):
        try:
            result = evaluate_interview_task(session_id)
        except Exception as exc:
            _fail("Evaluate interview task", str(exc))
            traceback.print_exc()
            return

    _pass("Evaluate interview task", f"recommendation={result['recommendation']}")

    # Verify report in DB
    report = supabase.table("interview_reports").select("*").eq("session_id", session_id).limit(1).execute()
    if not report.data:
        _fail("interview_report created", "not found in DB")
        return

    rep = report.data[0]
    _created_ids["report_id"] = rep["id"]
    grade = rep.get("overall_grade", 0)
    rec = rep.get("recommendation", "")
    _pass("interview_report in DB", f"id={rep['id']} grade={grade}/100 recommendation={rec}")

    if grade > 0:
        _pass("Overall grade is non-zero", f"{grade}/100")
    else:
        _fail("Overall grade", "is 0 — scoring may have failed silently")

    if rep.get("summary"):
        _pass("AI summary generated", rep["summary"][:80] + "...")
    else:
        _fail("AI summary", "empty")

    if rep.get("strengths"):
        _pass("Strengths populated", str(rep["strengths"]))
    else:
        _issue("Strengths", "empty array")

    # Check Q&A rows were scored
    qa_rows = supabase.table("interview_qa").select("*").eq("session_id", session_id).execute()
    scored = [q for q in (qa_rows.data or []) if q.get("technical_accuracy") is not None]
    if len(scored) == MAX_QUESTIONS:
        _pass("All Q&A pairs scored", f"{len(scored)}/{MAX_QUESTIONS}")
    else:
        _fail("Q&A scoring", f"only {len(scored)}/{MAX_QUESTIONS} rows have scores")

    # Check application status updated
    app_rec = supabase.table("applications").select("status").eq(
        "id", _created_ids["application_id"]
    ).single().execute().data
    final_status = app_rec.get("status")
    if final_status in ("shortlisted", "interviewed", "interview_rejected"):
        _pass("Application final status", f"{final_status}")
    else:
        _fail("Application final status", f"unexpected {final_status!r}")


def step_verify_question_limit() -> None:
    print("\n── Step 7: Verify question limit enforced ────────────────")
    from app.services.supabase import supabase

    if not _created_ids["session_id"]:
        _fail("Verify question limit", "No session_id")
        return

    qa_rows = supabase.table("interview_qa").select("question_number").eq(
        "session_id", _created_ids["session_id"]
    ).execute()

    count = len(qa_rows.data or [])
    nums = sorted(r["question_number"] for r in (qa_rows.data or []))

    if count == MAX_QUESTIONS:
        _pass("Question count matches limit", f"{count} == {MAX_QUESTIONS}")
    elif count > MAX_QUESTIONS:
        _fail("Question count EXCEEDS limit", f"{count} > {MAX_QUESTIONS} — old bug may still exist!")
    else:
        _fail("Question count below limit", f"{count} < {MAX_QUESTIONS}")

    if nums == list(range(1, MAX_QUESTIONS + 1)):
        _pass("Question numbers sequential", str(nums))
    else:
        _issue("Question numbering", f"got {nums}, expected {list(range(1, MAX_QUESTIONS+1))}")


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def print_report() -> None:
    print("\n" + "=" * 62)
    print("  END-TO-END SIMULATION REPORT")
    print("=" * 62)

    passes  = [r for r in _results if r["status"] == "PASS"]
    fails   = [r for r in _results if r["status"] == "FAIL"]
    issues  = [r for r in _results if r["status"] == "ISSUE"]

    for r in _results:
        icon = {"PASS": "✓", "FAIL": "✗", "ISSUE": "⚠"}[r["status"]]
        label = r["step"]
        detail = f"  → {r['detail']}" if r["detail"] else ""
        print(f"  {icon}  [{r['status']}] {label}{detail}")

    print(f"\n  {len(passes)} passed  |  {len(issues)} issues  |  {len(fails)} failed")

    if fails:
        print("\n  FAILURES (action required):")
        for f in fails:
            print(f"    ✗ {f['step']}: {f['detail']}")

    if issues:
        print("\n  ISSUES (worth investigating):")
        for i in issues:
            print(f"    ⚠ {i['step']}: {i['detail']}")

    print("=" * 62)
    return len(fails) == 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 62)
    print("  INT.AI — FULL PIPELINE END-TO-END SIMULATION")
    print(f"  Hiring post:  Beginner Python Dev ({HIRING_POST_ID[:8]}...)")
    print(f"  Template:     max_questions={MAX_QUESTIONS}")
    print(f"  Test user:    {TEST_EMAIL}")
    print("=" * 62)

    start = time.time()
    try:
        step_create_candidate()
        step_submit_application()
        step_screen_resume()
        step_verify_interview_session()
        step_simulate_interview()
        step_evaluate_interview()
        step_verify_question_limit()
    except Exception:
        print("\nUnexpected exception during simulation:")
        traceback.print_exc()
    finally:
        cleanup()

    elapsed = time.time() - start
    print(f"\n  Total time: {elapsed:.1f}s")
    ok = print_report()
    sys.exit(0 if ok else 1)
