"""Unit tests for skill coverage, fixed-weight overall score, and culture input."""

from unittest.mock import patch

import pytest

from app.services import scoring
from app.services.scoring import SCORING_WEIGHTS, _skill_coverage, compute_overall_score


def test_coverage_counts_direct_and_implied_as_covered():
    skills = [
        {"skill": "Python", "match_type": "direct"},
        {"skill": "OpenAI API", "match_type": "implied", "implied_by": "LangGraph LLM agents"},
        {"skill": "Docker", "match_type": "missing"},
        {"skill": "Git", "match_type": "missing"},
    ]
    assert _skill_coverage(skills) == 0.5
    assert [s["matched"] for s in skills] == [True, True, False, False]


def test_coverage_ignores_confidence():
    # A missing skill reported with some confidence no longer earns partial credit.
    skills = [
        {"skill": "PyTorch", "match_type": "direct", "confidence": 0.6},
        {"skill": "scikit-learn", "match_type": "missing", "confidence": 0.3},
    ]
    assert _skill_coverage(skills) == 0.5


def test_coverage_falls_back_to_matched_without_match_type():
    skills = [{"skill": "A", "matched": True}, {"skill": "B", "matched": False}]
    assert _skill_coverage(skills) == 0.5
    assert [s["match_type"] for s in skills] == ["direct", "missing"]


def test_coverage_overrides_inconsistent_matched_flag():
    skills = [{"skill": "A", "match_type": "missing", "matched": True}]
    assert _skill_coverage(skills) == 0.0
    assert skills[0]["matched"] is False


def test_coverage_of_no_skills_is_zero():
    assert _skill_coverage([]) == 0.0


def test_weights_are_fixed_and_sum_to_one():
    assert SCORING_WEIGHTS == {
        "embedding_similarity": 0.15,
        "skill_match": 0.35,
        "experience_match": 0.35,
        "culture_match": 0.15,
    }


def test_overall_uses_fixed_weights():
    scores = {
        "embedding_similarity": 0.48,
        "skill_match": 0.53,
        "experience_match": 0.85,
        "culture_match": 0.75,
    }
    assert compute_overall_score(scores) == pytest.approx(0.6675)


def test_overall_is_clamped():
    assert compute_overall_score({k: 2.0 for k in SCORING_WEIGHTS}) == 1.0


def _fake_result(skills):
    return {
        "skill_match": {"skills": skills},
        "experience_match": {"overall": 0.8},
        "culture_match": {"overall": 0.6},
    }


def test_score_all_dimensions_sends_culture_expectation_when_set():
    with patch.object(scoring, "_llm_json_request", return_value=_fake_result([])) as llm:
        scoring.score_all_dimensions("resume", "jd", ["Python"], "hacker, self-directed builder")
    user_content = llm.call_args.args[1]
    assert "## Culture Expectation\nhacker, self-directed builder" in user_content
    assert user_content.index("## Culture Expectation") < user_content.index("## Resume")


@pytest.mark.parametrize("expectation", [None, "", "   "])
def test_score_all_dimensions_omits_blank_culture_expectation(expectation):
    with patch.object(scoring, "_llm_json_request", return_value=_fake_result([])) as llm:
        scoring.score_all_dimensions("resume", "jd", ["Python"], expectation)
    assert "Culture Expectation" not in llm.call_args.args[1]


def test_score_all_dimensions_returns_coverage_as_skill_score():
    skills = [
        {"skill": "Python", "match_type": "direct"},
        {"skill": "RAG", "match_type": "implied", "implied_by": "retrieval + answer synthesis"},
        {"skill": "Docker", "match_type": "missing"},
    ]
    with patch.object(scoring, "_llm_json_request", return_value=_fake_result(skills)):
        skill, details, exp, _, cult, _ = scoring.score_all_dimensions("r", "jd", ["x"])
    assert skill == pytest.approx(2 / 3)
    assert details["skills"][1]["matched"] is True
    assert (exp, cult) == (0.8, 0.6)


def test_alternative_group_credits_missing_members():
    from app.services.scoring import _apply_alternative_groups

    details = {
        "alternative_groups": [["OpenAI API", "Anthropic API", "LangChain / LangGraph"]],
        "skills": [
            {"skill": "OpenAI API", "match_type": "missing", "evidence": ""},
            {"skill": "Anthropic API", "match_type": "missing", "evidence": ""},
            {"skill": "LangChain / LangGraph", "match_type": "direct", "evidence": "LangGraph"},
            {"skill": "Docker", "match_type": "missing", "evidence": ""},
        ],
    }
    _apply_alternative_groups(details)
    by_name = {s["skill"]: s for s in details["skills"]}
    for name in ("OpenAI API", "Anthropic API"):
        assert by_name[name]["match_type"] == "implied"
        assert by_name[name]["implied_by"].startswith("LangChain / LangGraph")
        assert by_name[name]["evidence"] == "LangGraph"
    assert by_name["Docker"]["match_type"] == "missing"
    assert _skill_coverage(details["skills"]) == 0.75


def test_alternative_group_with_no_covered_member_changes_nothing():
    from app.services.scoring import _apply_alternative_groups

    details = {
        "alternative_groups": [["A", "B"]],
        "skills": [{"skill": "A", "match_type": "missing"}, {"skill": "B", "match_type": "missing"}],
    }
    _apply_alternative_groups(details)
    assert [s["match_type"] for s in details["skills"]] == ["missing", "missing"]


def test_alternative_group_ignores_unknown_names_and_bad_shapes():
    from app.services.scoring import _apply_alternative_groups

    details = {
        "alternative_groups": [["A", "Not A Required Skill"], "garbage", None],
        "skills": [{"skill": "A", "match_type": "direct"}, {"skill": "B", "match_type": "missing"}],
    }
    _apply_alternative_groups(details)
    assert details["skills"][1]["match_type"] == "missing"


def test_score_all_dimensions_applies_alternative_groups():
    result = _fake_result([
        {"skill": "OpenAI API", "match_type": "missing"},
        {"skill": "LangChain / LangGraph", "match_type": "direct", "evidence": "LangGraph"},
    ])
    result["skill_match"]["alternative_groups"] = [["OpenAI API", "LangChain / LangGraph"]]
    with patch.object(scoring, "_llm_json_request", return_value=result):
        skill, details, *_ = scoring.score_all_dimensions("r", "jd", ["x"])
    assert skill == 1.0
    assert details["skills"][0]["match_type"] == "implied"


def test_score_all_dimensions_drops_malformed_skill_entries():
    result = _fake_result(["Python", None, {"no_skill": 1}, {"skill": "Git", "match_type": "direct"}])
    with patch.object(scoring, "_llm_json_request", return_value=result):
        skill, details, *_ = scoring.score_all_dimensions("r", "jd", ["x"])
    assert [s["skill"] for s in details["skills"]] == ["Git"]
    assert skill == 1.0
