"""Rescore: org scoping in the endpoint, and the task writes scores only.

App modules are imported inside each test: importing them at collection time
loads the real app.services.email, which defeats the sys.modules stub in
test_pipeline_health_and_usage.
"""

from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

ORG = "org-1"
A1, A2, A3, A4 = (f"00000000-0000-0000-0000-00000000000{i}" for i in range(1, 5))


def _rows():
    return [
        {"id": A1, "overall_score": 0.66, "hiring_posts": {"org_id": ORG}},
        {"id": A2, "overall_score": None, "hiring_posts": {"org_id": ORG}},
        {"id": A3, "overall_score": 0.8, "hiring_posts": {"org_id": "other-org"}},
    ]


def test_rescore_endpoint_queues_only_screened_apps_in_callers_org():
    from app.api import screening
    from app.models.screening import RescoreRequest

    sb = MagicMock()
    sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data = _rows()
    with (
        patch.object(screening, "_resolve_admin_org", return_value=ORG),
        patch.object(screening, "supabase", sb),
        patch.object(screening, "rescore_application_task") as task,
    ):
        resp = screening.rescore_applications(
            RescoreRequest(application_ids=[A1, A2, A3, A4, A1]), authorization="Bearer t"
        )
    assert resp.queued == [A1]
    assert resp.skipped == {A2: "not screened yet", A3: "not found", A4: "not found"}
    task.delay.assert_called_once_with(A1)


def test_rescore_request_rejects_bad_ids():
    from app.models.screening import RescoreRequest

    with pytest.raises(ValidationError):
        RescoreRequest(application_ids=["not-a-uuid"])
    with pytest.raises(ValidationError):
        RescoreRequest(application_ids=[])


def test_rescore_task_updates_scores_only():
    from app.tasks import rescore_application as task_mod

    application = {"id": A1, "hiring_post_id": "post-1", "resume_url": "a/b.pdf", "status": "resume_rejected"}
    post = {"id": "post-1", "org_id": ORG, "description": "jd", "required_skills": ["Python"]}
    dims = (0.6, {"skills": []}, 0.85, {"overall": 0.85}, 0.75, {"overall": 0.75})
    sb = MagicMock()
    with (
        patch.object(task_mod, "get_record", side_effect=lambda t, i: application if t == "applications" else post),
        patch.object(task_mod, "load_culture_expectation", return_value="hacker"),
        patch.object(task_mod, "download_resume_text", return_value="resume"),
        patch.object(task_mod, "score_embedding_similarity", return_value=0.48),
        patch.object(task_mod, "score_all_dimensions", return_value=dims) as score_all,
        patch.object(task_mod, "supabase", sb),
        patch.object(task_mod, "update_record") as update_record,
        patch.object(task_mod, "set_usage_context", return_value=None),
    ):
        result = task_mod.rescore_application_task.run(A1)

    score_all.assert_called_once_with("resume", "jd", ["Python"], "hacker")
    update_record.assert_called_once()
    table, app_id, payload = update_record.call_args.args
    assert (table, app_id) == ("applications", A1)
    assert set(payload) == {
        "embedding_score", "skill_match_score", "experience_match_score",
        "culture_match_score", "overall_score",
    }
    # 0.15*0.48 + 0.35*0.6 + 0.35*0.85 + 0.15*0.75
    assert payload["overall_score"] == pytest.approx(0.692, abs=1e-4)
    assert result["overall_score"] == payload["overall_score"]
    sb.table.assert_called_once_with("resume_data")


def test_rescore_module_has_no_email_or_session_side_effects():
    import inspect

    from app.tasks import rescore_application as task_mod

    source = inspect.getsource(task_mod)
    for forbidden in ("email", "interview_sessions", '"status"'):
        assert forbidden not in source.split('"""', 2)[2], forbidden
