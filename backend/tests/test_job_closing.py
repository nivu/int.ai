"""Submissions after a job's closing date are refused (spec 006 FR-004).

App modules are imported inside each test (see test_rescore.py for why).
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

JOB = "11111111-1111-1111-1111-111111111111"
BODY = {
    "hiring_post_id": JOB,
    "full_name": "Asha R",
    "email": "asha@example.com",
    "linkedin_url": "https://linkedin.com/in/asha",
    "resume_url": "applications/job/a.pdf",
}


class _Query:
    def __init__(self, table, data, calls):
        self.table, self.data, self.calls = table, data, calls

    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((self.table, name))
            return self

        return method

    def execute(self):
        return SimpleNamespace(data=self.data)


class _FakeSupabase:
    def __init__(self, post):
        self.post = post
        self.calls: list = []

    def table(self, name):
        data = {"candidates": [{"id": "cand-1"}], "hiring_posts": [self.post]}.get(name, [])
        return _Query(name, data, self.calls)


def _submit(post):
    from app.api import applications

    sb = _FakeSupabase(post)
    app = FastAPI()
    app.include_router(applications.router, prefix="/api/v1")
    with patch("app.services.supabase.supabase", sb):
        res = TestClient(app).post("/api/v1/applications/submit", json=BODY)
    return res, sb


def _iso(delta: timedelta) -> str:
    return (datetime.now(UTC) + delta).isoformat()


def test_past_closing_date_is_refused_before_any_application_is_written():
    res, sb = _submit({"status": "published", "closes_at": _iso(-timedelta(hours=1))})
    assert res.status_code == 403
    assert res.json()["detail"] == "This position is no longer accepting applications."
    assert not [c for c in sb.calls if c[0] == "applications"]


def test_closed_status_is_refused():
    res, _ = _submit({"status": "closed", "closes_at": None})
    assert res.status_code == 403


def test_future_or_missing_closing_date_passes_the_check():
    for closes_at in (None, _iso(timedelta(days=1))):
        _, sb = _submit({"status": "published", "closes_at": closes_at})
        assert [c for c in sb.calls if c[0] == "applications"]
