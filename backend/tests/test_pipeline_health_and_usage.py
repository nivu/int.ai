"""Unit tests for the pure parts of pipeline health and usage summaries."""

from datetime import UTC, datetime, timedelta

from app.services.pipeline_health import STUCK_AFTER, classify, new_since
from app.services.usage_report import summarize_usage

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
TITLES = {"job-1": "AI Engineer"}


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _app(app_id: str, created: datetime, **extra) -> dict:
    return {
        "id": app_id,
        "hiring_post_id": "job-1",
        "created_at": _iso(created),
        "candidates": {"full_name": "Asha", "email": "asha@example.com"},
        **extra,
    }


def test_recorded_failure_is_reported_with_its_error():
    apps = [
        _app(
            "a1",
            NOW - timedelta(minutes=2),
            screening_error="ValueError: Unsupported resume format: .txt",
            screening_failed_at=_iso(NOW - timedelta(minutes=1)),
        )
    ]
    issues = classify(apps, [], TITLES, now=NOW)
    assert [i["kind"] for i in issues] == ["screening_failed"]
    assert "Unsupported resume format" in issues[0]["detail"]
    assert issues[0]["job_title"] == "AI Engineer"


def test_applied_is_stuck_only_after_threshold():
    fresh = _app("fresh", NOW - timedelta(minutes=5))
    old = _app("old", NOW - STUCK_AFTER - timedelta(minutes=1))
    issues = classify([fresh, old], [], TITLES, now=NOW)
    assert [(i["kind"], i["application_id"]) for i in issues] == [("screening_stuck", "old")]


def test_works_without_failure_columns():
    # Before migration 027 the rows have no screening_* keys at all.
    issues = classify([_app("a1", NOW - timedelta(hours=3))], [], TITLES, now=NOW)
    assert issues[0]["kind"] == "screening_stuck"


def test_completed_interview_without_report():
    session = {
        "id": "s1",
        "application_id": "a1",
        "ended_at": _iso(NOW - timedelta(hours=1)),
        "interview_reports": None,
        "applications": {"hiring_post_id": "job-1", "candidates": [{"full_name": "Ravi"}]},
    }
    recent = {**session, "id": "s2", "ended_at": _iso(NOW - timedelta(minutes=3))}
    issues = classify([], [session, recent], TITLES, now=NOW)
    assert [(i["kind"], i["session_id"], i["candidate_name"]) for i in issues] == [
        ("evaluation_missing", "s1", "Ravi")
    ]


def test_new_since_reports_each_issue_once_across_windows():
    failed = {"kind": "screening_failed", "occurred_at": _iso(NOW - timedelta(minutes=30))}
    # Becomes visible STUCK_AFTER after submission: at NOW - 45m + 15m = NOW - 30m.
    stuck = {"kind": "screening_stuck", "occurred_at": _iso(NOW - timedelta(minutes=45))}
    issues = [failed, stuck]

    first = new_since(issues, NOW - timedelta(hours=1), NOW)
    second = new_since(issues, NOW, NOW + timedelta(hours=1))
    assert first == [failed, stuck]
    assert second == []


def test_new_since_skips_stuck_issue_not_yet_visible():
    stuck = {"kind": "screening_stuck", "occurred_at": _iso(NOW - timedelta(minutes=5))}
    assert new_since([stuck], NOW - timedelta(hours=1), NOW) == []


def test_summarize_usage_totals_and_breakdowns():
    since = datetime(2026, 9, 28, tzinfo=UTC)
    rows = [
        {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "operation": "score_resume",
            "input_tokens": 1000,
            "output_tokens": 200,
            "cost_usd": "0.000270",
            "status": "success",
            "hiring_post_id": "job-1",
            "created_at": "2026-09-29T10:00:00+00:00",
        },
        {
            "provider": "deepgram",
            "model": "nova-2",
            "operation": "stt",
            "duration_seconds": 60,
            "cost_usd": 0.0043,
            "status": "success",
            "hiring_post_id": "job-1",
            "created_at": "2026-09-30T10:00:00+00:00",
        },
        {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "operation": "score_resume",
            "cost_usd": 0,
            "status": "error",
            "hiring_post_id": None,
            "created_at": "2026-09-30T11:00:00+00:00",
        },
    ]
    summary = summarize_usage(rows, since=since, until=NOW, job_titles=TITLES)

    assert summary["total_calls"] == 3
    assert summary["error_calls"] == 1
    assert summary["total_cost_usd"] == 0.00457
    assert [d["date"] for d in summary["by_day"]] == ["2026-09-28", "2026-09-29", "2026-09-30"]
    assert [d["cost_usd"] for d in summary["by_day"]] == [0.0, 0.00027, 0.0043]
    assert summary["by_provider"][0]["provider"] == "deepgram"

    score = next(o for o in summary["by_operation"] if o["operation"] == "score_resume")
    assert (score["calls"], score["errors"], score["input_tokens"]) == (2, 1, 1000)

    jobs = {j["title"]: j["calls"] for j in summary["by_job"]}
    assert jobs == {"AI Engineer": 2, "Not tied to a job": 1}


def test_summarize_usage_empty_period():
    summary = summarize_usage([], since=NOW - timedelta(days=6), until=NOW)
    assert summary["total_cost_usd"] == 0
    assert len(summary["by_day"]) == 7


def test_per_question_evaluation_calls_are_grouped():
    rows = [
        {
            "provider": "openai",
            "operation": f"evaluate:score_q{n}",
            "cost_usd": 0.01,
            "status": "success",
            "created_at": "2026-09-30T10:00:00+00:00",
        }
        for n in (1, 2, 10)
    ] + [
        {
            "provider": "openai",
            "operation": "evaluate:synthesis",
            "cost_usd": 0.02,
            "status": "success",
            "created_at": "2026-09-30T10:00:00+00:00",
        }
    ]
    summary = summarize_usage(rows, since=NOW - timedelta(days=1), until=NOW)
    ops = {o["operation"]: o["calls"] for o in summary["by_operation"]}
    assert ops == {"evaluate:score_question": 3, "evaluate:synthesis": 1}
