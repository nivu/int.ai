"""Client job access: admin grant endpoints and the client change request.

App modules are imported inside each test (see test_rescore.py for why), and
app.services.email is unloaded again afterwards so the sys.modules stub in
test_pipeline_health_and_usage still takes effect.
"""

import sys
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

JOB = "11111111-1111-1111-1111-111111111111"
OTHER_JOB = "22222222-2222-2222-2222-222222222222"
GRANT = "33333333-3333-3333-3333-333333333333"
ADMIN = {"id": "tm-admin", "org_id": "org-1", "role": "admin", "status": "active"}
POST = {"id": JOB, "title": "AI Engineer", "org_id": "org-1", "created_by": "tm-creator"}
HEADERS = {"Authorization": "Bearer t"}


@pytest.fixture(autouse=True)
def _unload_email_module():
    loaded = {m: sys.modules.get(m) for m in ("app.services.email", "app.api.client_access")}
    yield
    for name, module in loaded.items():
        if module is None:
            sys.modules.pop(name, None)
            package, _, attr = name.rpartition(".")
            if package in sys.modules and hasattr(sys.modules[package], attr):
                delattr(sys.modules[package], attr)


class _Query:
    """Fluent stand-in for a postgrest query; records every call."""

    def __init__(self, table: str, results: list, calls: list):
        self.table, self.results, self.calls = table, results, calls

    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((self.table, name, args, kwargs))
            return self

        return method

    def execute(self):
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return SimpleNamespace(data=result)


class _FakeSupabase:
    def __init__(self, tables: dict[str, list] | None = None, rpc: list | dict | None = None):
        self.tables = tables or {}
        self.rpc_data = rpc or []
        self.calls: list = []
        self.auth = MagicMock()

    def table(self, name):
        return _Query(name, self.tables[name], self.calls)

    def rpc(self, fn, params):
        self.calls.append(("rpc", fn, (params,), {}))
        data = self.rpc_data[fn] if isinstance(self.rpc_data, dict) else self.rpc_data
        return _Query("rpc", [data], self.calls)

    def called(self, table, method):
        return [c for c in self.calls if c[0] == table and c[1] == method]


@contextmanager
def _client(sb, member=ADMIN, client_user=None):
    from app.api import client_access

    app = FastAPI()
    app.include_router(client_access.router, prefix="/api/v1")
    email_service = MagicMock()
    with (
        patch.object(client_access, "supabase", sb),
        patch.object(client_access, "_resolve_admin_member", return_value=member),
        patch.object(client_access, "_resolve_client_user", return_value=client_user),
        patch.object(client_access, "email_service", email_service),
    ):
        yield TestClient(app), email_service


def _grant_row(**extra):
    return {
        "id": GRANT,
        "hiring_post_id": JOB,
        "email": "client@acme.com",
        "client_company": "Acme",
        "created_at": "2026-10-17T00:00:00+00:00",
        "revoked_at": None,
        **extra,
    }


def test_recruiter_gets_403():
    sb = _FakeSupabase()
    with _client(sb, member={**ADMIN, "role": "recruiter"}) as (client, _):
        assert client.get(f"/api/v1/jobs/{JOB}/client-access", headers=HEADERS).status_code == 403
        resp = client.post(
            f"/api/v1/jobs/{JOB}/client-access", json={"email": "c@x.com"}, headers=HEADERS
        )
        assert resp.status_code == 403
        assert (
            client.delete(f"/api/v1/jobs/{JOB}/client-access/{GRANT}", headers=HEADERS).status_code
            == 403
        )
    assert sb.calls == []


def test_other_org_job_gets_403():
    sb = _FakeSupabase({"hiring_posts": [[{**POST, "org_id": "org-2"}]]})
    with _client(sb) as (client, _):
        resp = client.get(f"/api/v1/jobs/{JOB}/client-access", headers=HEADERS)
    assert resp.status_code == 403


def test_missing_job_gets_404():
    sb = _FakeSupabase({"hiring_posts": [[]]})
    with _client(sb) as (client, _):
        resp = client.get(f"/api/v1/jobs/{JOB}/client-access", headers=HEADERS)
    assert resp.status_code == 404


def _invite_sb(insert_result=None, prepare="ready"):
    return _FakeSupabase(
        {
            "hiring_posts": [[POST]],
            "job_client_access": [[], insert_result or [_grant_row()]],
        },
        rpc={"prepare_client_account": prepare},
    )


def test_invite_lowercases_email_creates_auth_user_and_sends():
    sb = _invite_sb()
    with _client(sb) as (client, email_service):
        resp = client.post(
            f"/api/v1/jobs/{JOB}/client-access",
            json={"email": "Client@ACME.com", "client_company": "  Acme  "},
            headers=HEADERS,
        )
    assert resp.status_code == 201
    assert resp.json()["email_sent"] is True
    assert resp.json()["grant"]["id"] == GRANT
    sb.auth.admin.create_user.assert_called_once_with(
        {"email": "client@acme.com", "email_confirm": True, "app_metadata": {"int_ai_client": True}}
    )
    sb.auth.admin.list_users.assert_not_called()
    [prepare] = sb.called("rpc", "prepare_client_account")
    assert prepare[2][0] == {"p_email": "client@acme.com"}
    [insert] = sb.called("job_client_access", "insert")
    assert insert[2][0] == {
        "hiring_post_id": JOB,
        "email": "client@acme.com",
        "client_company": "Acme",
        "invited_by": "tm-admin",
    }
    args, kwargs = email_service.send_client_job_invitation.call_args
    assert args[:2] == ("client@acme.com", "AI Engineer")
    assert kwargs["login_url"].endswith("/auth/login?type=client")


@pytest.mark.parametrize("prepare", ["prepared", "ready", "staff"])
def test_invite_existing_auth_user_still_201(prepare):
    from supabase_auth.errors import AuthApiError

    sb = _invite_sb(prepare=prepare)
    sb.auth.admin.create_user.side_effect = AuthApiError(
        "A user with this email address has already been registered", 422, "email_exists"
    )
    with _client(sb) as (client, _):
        resp = client.post(
            f"/api/v1/jobs/{JOB}/client-access", json={"email": "c@x.com"}, headers=HEADERS
        )
    assert resp.status_code == 201
    assert len(sb.called("rpc", "prepare_client_account")) == 1
    assert len(sb.called("job_client_access", "insert")) == 1


@pytest.mark.parametrize("prepare", ["missing", None, RuntimeError("db down")])
def test_invite_prepare_failure_returns_502_without_insert(prepare):
    sb = _invite_sb(prepare=prepare)
    with _client(sb) as (client, email_service):
        resp = client.post(
            f"/api/v1/jobs/{JOB}/client-access", json={"email": "c@x.com"}, headers=HEADERS
        )
    assert resp.status_code == 502
    assert sb.called("job_client_access", "insert") == []
    email_service.send_client_job_invitation.assert_not_called()


def test_invite_auth_failure_returns_502_without_insert():
    sb = _invite_sb()
    sb.auth.admin.create_user.side_effect = RuntimeError("auth down")
    with _client(sb) as (client, email_service):
        resp = client.post(
            f"/api/v1/jobs/{JOB}/client-access", json={"email": "c@x.com"}, headers=HEADERS
        )
    assert resp.status_code == 502
    assert sb.called("rpc", "prepare_client_account") == []
    assert sb.called("job_client_access", "insert") == []
    email_service.send_client_job_invitation.assert_not_called()


def test_invite_email_failure_reports_email_sent_false():
    sb = _invite_sb()
    with _client(sb) as (client, email_service):
        email_service.send_client_job_invitation.side_effect = RuntimeError("resend down")
        resp = client.post(
            f"/api/v1/jobs/{JOB}/client-access", json={"email": "c@x.com"}, headers=HEADERS
        )
    assert resp.status_code == 201
    assert resp.json()["email_sent"] is False


def test_invite_duplicate_precheck_gets_409():
    sb = _FakeSupabase({"hiring_posts": [[POST]], "job_client_access": [[{"id": GRANT}]]})
    with _client(sb) as (client, _):
        resp = client.post(
            f"/api/v1/jobs/{JOB}/client-access", json={"email": "c@x.com"}, headers=HEADERS
        )
    assert resp.status_code == 409
    sb.auth.admin.create_user.assert_not_called()
    assert sb.called("job_client_access", "insert") == []


def test_invite_unique_violation_race_gets_409():
    from postgrest.exceptions import APIError

    race = APIError(
        {
            "code": "23505",
            "message": 'duplicate key value violates unique constraint "job_client_access_active_uq"',
        }
    )
    sb = _FakeSupabase(
        {"hiring_posts": [[POST]], "job_client_access": [[], race]},
        rpc={"prepare_client_account": "ready"},
    )
    with _client(sb) as (client, _):
        resp = client.post(
            f"/api/v1/jobs/{JOB}/client-access", json={"email": "c@x.com"}, headers=HEADERS
        )
    assert resp.status_code == 409


def test_revoke_sets_revoked_at():
    sb = _FakeSupabase(
        {"hiring_posts": [[POST]], "job_client_access": [[{"id": GRANT, "revoked_at": None}], []]}
    )
    with _client(sb) as (client, _):
        resp = client.delete(f"/api/v1/jobs/{JOB}/client-access/{GRANT}", headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    [update] = sb.called("job_client_access", "update")
    assert update[2][0]["revoked_at"]


def test_revoke_already_revoked_is_ok_without_update():
    sb = _FakeSupabase(
        {
            "hiring_posts": [[POST]],
            "job_client_access": [[{"id": GRANT, "revoked_at": "2026-10-01T00:00:00+00:00"}]],
        }
    )
    with _client(sb) as (client, _):
        resp = client.delete(f"/api/v1/jobs/{JOB}/client-access/{GRANT}", headers=HEADERS)
    assert resp.status_code == 200
    assert sb.called("job_client_access", "update") == []


CLIENT_USER = {"user_id": "client-uid", "email": "client@acme.com"}


def test_change_request_without_grant_gets_403_and_no_email():
    sb = _FakeSupabase(rpc=[OTHER_JOB])
    with _client(sb, client_user=CLIENT_USER) as (client, email_service):
        resp = client.post(
            f"/api/v1/client/jobs/{JOB}/change-request", json={"message": "hi"}, headers=HEADERS
        )
    assert resp.status_code == 403
    email_service.send_client_change_request.assert_not_called()
    assert sb.called("rpc", "client_post_ids_for_user")[0][2][0] == {"p_user_id": "client-uid"}


def test_change_request_emails_creator_and_admins_with_reply_to():
    sb = _FakeSupabase(
        {
            "hiring_posts": [[POST]],
            "team_members": [
                [{"user_id": "u-creator"}],
                [{"user_id": "u-admin"}, {"user_id": "u-creator"}],
            ],
            "job_client_access": [[{"client_company": "Acme"}]],
        },
        rpc=[JOB],
    )
    emails = {"u-creator": "Creator@Org.com", "u-admin": "admin@org.com"}
    sb.auth.admin.get_user_by_id.side_effect = lambda uid: SimpleNamespace(
        user=SimpleNamespace(email=emails[uid])
    )
    with _client(sb, client_user=CLIENT_USER) as (client, email_service):
        resp = client.post(
            f"/api/v1/client/jobs/{JOB}/change-request",
            json={"message": "Please update the salary"},
            headers=HEADERS,
        )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    # created_by is a team_members.id, resolved to its user_id
    creator_lookup = sb.called("team_members", "eq")[0]
    assert creator_lookup[2] == ("id", "tm-creator")
    assert sb.auth.admin.get_user_by_id.call_count == 2
    email_service.send_client_change_request.assert_called_once_with(
        ["creator@org.com", "admin@org.com"],
        "AI Engineer",
        "client@acme.com",
        "Acme",
        "Please update the salary",
    )
    assert sb.called("hiring_posts", "update") == []


def _change_request_sb():
    return _FakeSupabase(
        {
            "hiring_posts": [[POST]],
            "team_members": [[{"user_id": "u-creator"}], [{"user_id": "u-admin"}]],
            "job_client_access": [[{"client_company": "Acme"}]],
        },
        rpc=[JOB],
    )


def test_change_request_skips_recipient_whose_lookup_fails():
    sb = _change_request_sb()

    def lookup(uid):
        if uid == "u-creator":
            raise RuntimeError("auth down")
        return SimpleNamespace(user=SimpleNamespace(email="admin@org.com"))

    sb.auth.admin.get_user_by_id.side_effect = lookup
    with _client(sb, client_user=CLIENT_USER) as (client, email_service):
        resp = client.post(
            f"/api/v1/client/jobs/{JOB}/change-request", json={"message": "hi"}, headers=HEADERS
        )
    assert resp.status_code == 200
    assert email_service.send_client_change_request.call_args[0][0] == ["admin@org.com"]


def test_change_request_all_recipient_lookups_fail_gets_502():
    sb = _change_request_sb()
    sb.auth.admin.get_user_by_id.side_effect = RuntimeError("auth down")
    with _client(sb, client_user=CLIENT_USER) as (client, email_service):
        resp = client.post(
            f"/api/v1/client/jobs/{JOB}/change-request", json={"message": "hi"}, headers=HEADERS
        )
    assert resp.status_code == 502
    email_service.send_client_change_request.assert_not_called()


@pytest.mark.parametrize("message", ["x" * 2001, "", "   \n\t  "])
def test_change_request_message_invalid_gets_422(message):
    sb = _FakeSupabase(rpc=[JOB])
    with _client(sb, client_user=CLIENT_USER) as (client, email_service):
        resp = client.post(
            f"/api/v1/client/jobs/{JOB}/change-request",
            json={"message": message},
            headers=HEADERS,
        )
    assert resp.status_code == 422
    email_service.send_client_change_request.assert_not_called()


def test_change_request_email_escapes_and_sets_reply_to():
    from app.services import email

    with patch.object(email.resend.Emails, "send", return_value={"id": "m1"}) as send:
        email.send_client_change_request(
            ["admin@org.com"],
            "AI <b>Engineer</b>",
            "client@acme.com",
            "Acme & Co",
            "<script>alert(1)</script>\nline two",
        )
    payload = send.call_args[0][0]
    assert "<script>" not in payload["html"]
    assert "&lt;script&gt;alert(1)&lt;/script&gt;<br>line two" in payload["html"]
    assert "Acme &amp; Co" in payload["html"]
    assert "<b>Engineer</b>" not in payload["html"]
    assert payload["reply_to"] == "client@acme.com"
    assert payload["to"] == ["admin@org.com"]
