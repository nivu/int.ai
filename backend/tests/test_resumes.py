"""Resume download: staff of the job's org and granted clients get signed links;
everyone else gets 403. See specs/004-resume-download/spec.md.

App modules are imported inside each test (see test_rescore.py for why).
"""

import io
import sys
import zipfile
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

JOB = "11111111-1111-1111-1111-111111111111"
OTHER_JOB = "22222222-2222-2222-2222-222222222222"
APP_ID = "44444444-4444-4444-4444-444444444444"
POST = {"id": JOB, "title": "Senior AI/ML Engineer", "org_id": "org-1"}
APPLICATION = {
    "id": APP_ID,
    "hiring_post_id": JOB,
    "resume_url": "applications/job/abc.pdf",
    "resume_filename": "Jane Doe CV.pdf",
}
STAFF = [{"org_id": "org-1", "status": "active"}]
HEADERS = {"Authorization": "Bearer t"}


@pytest.fixture(autouse=True)
def _unload_module():
    loaded = sys.modules.get("app.api.resumes")
    yield
    if loaded is None:
        sys.modules.pop("app.api.resumes", None)


class _Query:
    def __init__(self, data):
        self.data = data

    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        return SimpleNamespace(data=self.data)


class _FakeSupabase:
    def __init__(self, tables, client_posts=(), files=None):
        self.tables = tables
        self.client_posts = [{"client_post_ids_for_user": p} for p in client_posts]
        self.files = files or {}
        self.bucket = MagicMock()
        self.bucket.create_signed_url.side_effect = self._sign
        self.bucket.download.side_effect = self._download
        self.storage = MagicMock()
        self.storage.from_.return_value = self.bucket
        self.auth = MagicMock()

    def _sign(self, path, expires, options):
        if path not in self.files and not path.startswith("exports/"):
            raise RuntimeError("Object not found")
        return {"signedURL": f"https://signed/{path}?download={options['download']}"}

    def _download(self, path):
        if path not in self.files:
            raise RuntimeError("Object not found")
        return self.files[path]

    def table(self, name):
        return _Query(self.tables[name])

    def rpc(self, fn, params):
        return _Query(self.client_posts)


@contextmanager
def _client(sb):
    from app.api import resumes

    app = FastAPI()
    app.include_router(resumes.router, prefix="/api/v1")
    with (
        patch.object(resumes, "supabase", sb),
        patch.object(resumes, "_caller", return_value="user-1"),
    ):
        yield TestClient(app)


def _single(members=(), client_posts=(), application=APPLICATION, files=None):
    sb = _FakeSupabase(
        {"applications": [application], "hiring_posts": [POST], "team_members": list(members)},
        client_posts,
        {APPLICATION["resume_url"]: b"%PDF"} if files is None else files,
    )
    with _client(sb) as client:
        return client.get(f"/api/v1/applications/{APP_ID}/resume", headers=HEADERS), sb


def test_staff_of_job_org_gets_signed_link():
    res, sb = _single(members=STAFF)
    assert res.status_code == 200
    body = res.json()
    assert body["filename"] == "Jane Doe CV.pdf"
    assert body["expires_in"] == 300
    sb.bucket.create_signed_url.assert_called_once_with(
        APPLICATION["resume_url"], 300, {"download": "Jane Doe CV.pdf"}
    )


def test_granted_client_gets_signed_link():
    res, _ = _single(client_posts=[JOB])
    assert res.status_code == 200


@pytest.mark.parametrize(
    "members,client_posts",
    [
        ([], []),  # signed-in stranger
        ([], [OTHER_JOB]),  # client of another job
        ([{"org_id": "org-2", "status": "active"}], []),  # staff of another org
        ([{"org_id": "org-1", "status": "invited"}], []),  # inactive staff
    ],
)
def test_disallowed_callers_get_403(members, client_posts):
    res, sb = _single(members=members, client_posts=client_posts)
    assert res.status_code == 403
    sb.bucket.create_signed_url.assert_not_called()


def test_missing_resume_is_404():
    res, _ = _single(members=STAFF, application={**APPLICATION, "resume_url": None})
    assert res.status_code == 404
    res, _ = _single(members=STAFF, files={})
    assert res.status_code == 404


def test_filename_gets_extension_from_path():
    res, _ = _single(members=STAFF, application={**APPLICATION, "resume_filename": "resume"})
    assert res.json()["filename"] == "resume.pdf"


def _export(members=(), client_posts=(), applications=None, files=None):
    applications = applications or [
        {
            "id": "a1",
            "resume_url": "p/1.pdf",
            "resume_filename": "x.pdf",
            "candidate": {"full_name": "Ravi K"},
        },
        {
            "id": "a2",
            "resume_url": "p/2.pdf",
            "resume_filename": "y.pdf",
            "candidate": {"full_name": "Ravi K"},
        },
        {
            "id": "a3",
            "resume_url": None,
            "resume_filename": None,
            "candidate": {"full_name": "No File"},
        },
        {
            "id": "a4",
            "resume_url": "p/gone.pdf",
            "resume_filename": "z.pdf",
            "candidate": {"full_name": "A/B: C"},
        },
    ]
    files = {"p/1.pdf": b"one", "p/2.pdf": b"two"} if files is None else files
    sb = _FakeSupabase(
        {"applications": applications, "hiring_posts": [POST], "team_members": list(members)},
        client_posts,
        files,
    )
    with _client(sb) as client:
        return client.post(f"/api/v1/jobs/{JOB}/resume-export", headers=HEADERS), sb


def test_export_zips_available_resumes_and_skips_missing():
    res, sb = _export(client_posts=[JOB])
    assert res.status_code == 200
    body = res.json()
    assert (body["included"], body["skipped"]) == (2, 2)
    assert body["filename"] == "senior-ai-ml-engineer-resumes.zip"

    path, data, options = sb.bucket.upload.call_args.args
    assert path == f"exports/{JOB}/resumes.zip"
    assert options["upsert"] == "true"
    names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    assert names == ["Ravi K.pdf", "Ravi K (2).pdf"]


def test_export_forbidden_writes_nothing():
    res, sb = _export(client_posts=[OTHER_JOB])
    assert res.status_code == 403
    sb.bucket.upload.assert_not_called()


def test_export_with_no_resumes_is_404():
    res, sb = _export(members=STAFF, files={})
    assert res.status_code == 404
    sb.bucket.upload.assert_not_called()


def test_unsafe_names_are_cleaned():
    from app.api.resumes import _safe

    assert _safe("A/B: C", "candidate") == "AB C"
    assert _safe("../..", "candidate") == "candidate"
    assert _safe(None, "candidate") == "candidate"
