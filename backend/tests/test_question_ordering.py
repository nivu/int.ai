"""Resume-anchored project questions are spread and capped (spec 009).

App modules are imported inside each test (see test_rescore.py for why).
"""

from unittest.mock import patch

C, P, G = "custom", "resume_project", "foundational"


def _projects(n):
    return [{"name": f"Project {i}", "description": "", "tech": ""} for i in range(1, n + 1)]


def _run(max_questions, custom, projects, ratio=0.6, anchored_fails=()):
    """Ask max_questions questions and return their types in order.

    `anchored_fails` lists project names whose first anchored generation raises.
    """
    from app.interview import question_gen
    from app.interview.question_gen import QuestionGenerator

    fail_once = set(anchored_fails)

    def fake_llm(self, system_prompt, user_content, temperature=0.7):
        if "explicitly references a named project" in system_prompt:
            name = user_content.split("\n", 1)[0].removeprefix("Project name: ")
            if name in fail_once:
                fail_once.discard(name)
                raise RuntimeError("anchored generation failed")
            return {"question_text": f"In your {name} project, ...", "topic": name}
        return {"question_text": "Generated?", "question_type": "foundational", "topic": "t"}

    gen = QuestionGenerator(
        resume_markdown="",
        jd_text="",
        custom_questions=[f"Custom {i}" for i in range(custom)],
        resume_projects=projects,
        max_questions=max_questions,
    )
    with patch.object(question_gen.QuestionGenerator, "_llm_json", fake_llm):
        asked = [gen.generate_next_question(ratio) for _ in range(max_questions)]
    return [q["question_type"] for q in asked], asked


def test_projects_are_spread_and_capped():
    types, _ = _run(10, custom=2, projects=_projects(6))
    assert types == [C, C, G, P, G, P, G, G, P, G]


def test_single_project_is_asked_once_at_slot_two():
    types, asked = _run(10, custom=0, projects=_projects(1))
    assert types == [G, P] + [G] * 8
    assert asked[1]["question_text"].startswith("In your Project 1 project")


def test_no_projects_keeps_custom_then_generated():
    types, _ = _run(10, custom=3, projects=[])
    assert types == [C, C, C] + [G] * 7


def test_custom_questions_filling_the_limit_leave_no_project_slot():
    types, _ = _run(4, custom=4, projects=_projects(3))
    assert types == [C] * 4
    types, _ = _run(4, custom=6, projects=_projects(3))
    assert P not in types


def test_failed_anchored_generation_falls_back_and_retries_project():
    types, asked = _run(10, custom=2, projects=_projects(2), anchored_fails=("Project 1",))
    # Open slot 2 is due a project; Project 1 fails, so a generated question is
    # asked and Project 1 stays queued. Open slot 3 is still behind the pace, so
    # Project 1 is asked there, then Project 2 at open slot 4.
    assert types == [C, C, G, G, P, P, G, G, G, G]
    assert asked[4]["topic"] == "Project 1"
    assert asked[5]["topic"] == "Project 2"


def test_cap_rounds_half_up_exactly():
    # 1 - 0.9 is 0.0999... in floats; the spec's cap is floor(open * 0.1 + 0.5).
    for open_slots, expected in [(5, 1), (15, 2), (25, 3)]:
        types, _ = _run(open_slots, custom=0, projects=_projects(10), ratio=0.9)
        assert types.count(P) == expected
    types, _ = _run(30, custom=0, projects=_projects(30), ratio=0.55)
    assert types.count(P) == 14


def test_null_ratio_uses_default_for_project_slots():
    from app.interview.question_gen import QuestionGenerator

    gen = QuestionGenerator(
        resume_markdown="", jd_text="", resume_projects=_projects(3), max_questions=10
    )
    assert gen._anchored_project_due(None) is False  # open slot 1: none due yet at 0.6
    gen._open_slots_used = 1
    assert gen._anchored_project_due(None) is True  # open slot 2: first project due


def test_projects_follow_ratio():
    types, _ = _run(10, custom=0, projects=_projects(10), ratio=0.0)
    assert types == [P] * 10
    types, _ = _run(10, custom=0, projects=_projects(10), ratio=1.0)
    assert types == [G] * 10
