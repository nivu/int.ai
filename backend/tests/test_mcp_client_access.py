"""MCP client-access tools: admin-only, org-scoped wrappers around the shared
grant/list/revoke helpers in app.api.client_access.

App modules are imported inside each test (see test_rescore.py for why), and
unloaded again afterwards so the sys.modules stub in
test_pipeline_health_and_usage still takes effect.
"""

import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

JOB = "11111111-1111-1111-1111-111111111111"
GRANT = "33333333-3333-3333-3333-333333333333"
POST = {"id": JOB, "title": "AI Engineer", "org_id": "org-1", "status": "published"}
ROW = {
    "id": GRANT,
    "hiring_post_id": JOB,
    "email": "client@acme.com",
    "client_company": "Acme",
    "created_at": "2026-10-17T00:00:00+00:00",
    "revoked_at": None,
}

_MODULES = ("app.services.email", "app.api.client_access", "app.mcp.server")


@pytest.fixture(autouse=True)
def _unload_modules():
    loaded = {m: sys.modules.get(m) for m in _MODULES}
    yield
    for name, module in loaded.items():
        if module is None:
            sys.modules.pop(name, None)
            package, _, attr = name.rpartition(".")
            if package in sys.modules and hasattr(sys.modules[package], attr):
                delattr(sys.modules[package], attr)


class _Query:
    def __init__(self, data):
        self.data = data

    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        return SimpleNamespace(data=self.data)


def _sb(member=None, post=POST):
    """Fake supabase: team_members returns ``member``; hiring_posts returns ``post``."""
    sb = MagicMock()
    sb.table.side_effect = lambda name: _Query(
        {"team_members": [member] if member else [], "hiring_posts": [post] if post else []}[name]
    )
    return sb


ADMIN = {"org_id": "org-1", "role": "admin", "status": "active"}


def _patched(sb, **helpers):
    from app.mcp import server

    patches = [
        patch.object(server, "_actor", return_value=("org-1", "tm-admin")),
        patch.object(server, "sb", sb),
    ]
    patches += [patch.object(server, name, fn) for name, fn in helpers.items()]
    return server, patches


def _run(sb, call, **helpers):
    server, patches = _patched(sb, **helpers)
    for p in patches:
        p.start()
    try:
        return call(server)
    finally:
        for p in patches:
            p.stop()


@pytest.mark.parametrize(
    "member",
    [
        None,
        {"org_id": "org-1", "role": "recruiter", "status": "active"},
        {"org_id": "org-1", "role": "admin", "status": "invited"},
        {"org_id": "org-2", "role": "admin", "status": "active"},
    ],
)
def test_non_admin_is_refused(member):
    from mcp.server.mcpserver.exceptions import ToolError

    grant = MagicMock()
    with pytest.raises(ToolError, match="Only admins"):
        _run(_sb(member), lambda s: s.grant_client_access(JOB, "client@acme.com"), grant_access=grant)
    grant.assert_not_called()


def test_job_outside_org_is_refused():
    from mcp.server.mcpserver.exceptions import ToolError

    grant = MagicMock()
    with pytest.raises(ToolError, match="not found in your organisation"):
        _run(_sb(ADMIN, post=None), lambda s: s.grant_client_access(JOB, "client@acme.com"), grant_access=grant)
    grant.assert_not_called()


def test_grant_rejects_invalid_email():
    from mcp.server.mcpserver.exceptions import ToolError

    grant = MagicMock()
    with pytest.raises(ToolError, match="Invalid email"):
        _run(_sb(ADMIN), lambda s: s.grant_client_access(JOB, "not-an-email"), grant_access=grant)
    grant.assert_not_called()


def test_grant_calls_shared_helper():
    grant = MagicMock(return_value=(ROW, True))
    out = _run(
        _sb(ADMIN), lambda s: s.grant_client_access(JOB, "Client@Acme.com", "Acme"), grant_access=grant
    )
    grant.assert_called_once_with(JOB, "AI Engineer", "Client@acme.com", "Acme", "tm-admin")
    assert out["email_sent"] is True
    assert out["grant"]["id"] == GRANT


def test_grant_maps_http_error_to_tool_error():
    from mcp.server.mcpserver.exceptions import ToolError

    grant = MagicMock(side_effect=HTTPException(409, "This email already has access to this job"))
    with pytest.raises(ToolError, match="already has access"):
        _run(_sb(ADMIN), lambda s: s.grant_client_access(JOB, "client@acme.com"), grant_access=grant)


def test_list_and_revoke_call_shared_helpers():
    listing = MagicMock(return_value=[ROW])
    assert _run(_sb(ADMIN), lambda s: s.list_client_access(JOB), list_grants=listing) == [ROW]
    listing.assert_called_once_with(JOB)

    revoke = MagicMock(return_value=None)
    out = _run(_sb(ADMIN), lambda s: s.revoke_client_access(JOB, GRANT), revoke_grant=revoke)
    revoke.assert_called_once_with(JOB, GRANT, "tm-admin")
    assert out["status"] == "revoked"
