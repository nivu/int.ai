"""AI interview question generator powered by OpenAI GPT-4o mini.

Produces contextual, non-repetitive technical interview questions based on the
candidate's resume, the job description, and the conversation so far.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import OpenAI

from app.config import settings

logger = logging.getLogger("int.ai")

_MODEL = "gpt-4o-mini"


# ---------------------------------------------------------------------------
# QuestionGenerator
# ---------------------------------------------------------------------------
class QuestionGenerator:
    """Generates contextual interview questions using OpenAI."""

    def __init__(
        self,
        resume_markdown: str,
        jd_text: str,
        job_title: str = "",
        conversation_history: list[dict[str, str]] | None = None,
        custom_questions: list[str] | None = None,
        resume_projects: list[dict] | None = None,
    ) -> None:
        self.resume_markdown = resume_markdown
        self.jd_text = jd_text
        self.job_title = job_title
        self.conversation_history: list[dict[str, str]] = conversation_history or []
        # Recruiter-defined questions to ask before AI-generated ones.
        # Filter out any empty or non-string entries at construction time.
        self._custom_questions_remaining: list[str] = [
            q for q in (custom_questions or []) if isinstance(q, str) and q.strip()
        ]
        # Resume projects to anchor explicit project questions to.
        # Filtered to entries with a non-empty name.
        self._projects_to_probe: list[dict] = [
            p for p in (resume_projects or [])
            if isinstance(p, dict) and str(p.get("name", "")).strip()
        ]

    def _llm_json(self, system_prompt: str, user_content: str, temperature: float = 0.7) -> dict:
        client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())
        response = client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            temperature=temperature,
        )
        return json.loads(response.choices[0].message.content)

    def _generate_anchored_project_question(self, project: dict) -> dict[str, Any]:
        """Generate a question that explicitly names and probes a resume project."""
        name = str(project.get("name", "")).strip()
        description = str(project.get("description", "") or "").strip()
        tech = str(project.get("tech", "") or "").strip()
        role_context = f" for a {self.job_title} role" if self.job_title else ""

        system_prompt = (
            f"You are an expert technical interviewer conducting an interview{role_context}. "
            "Generate a deep, specific technical question that explicitly references a named "
            "project from the candidate's resume. "
            "The question MUST open with a natural reference to the project — for example: "
            "'I see you worked on [project name] — ...' or 'In your [project name] project, ...' "
            "Never ask generically about 'a project you worked on'. "
            "Probe for concrete technical decisions, trade-offs, or challenges specific to this project. "
            "Respond with ONLY a JSON object: "
            '{"question_text": "...", "topic": "2-4 word label for the specific topic"}'
        )
        user_content = (
            f"Project name: {name}\n"
            f"Project description: {description}\n"
            f"Technologies used: {tech}\n\n"
            f"Job description:\n{self.jd_text}"
        )
        try:
            result = self._llm_json(system_prompt, user_content, temperature=0.7)
            return {
                "question_text": result.get("question_text", "").strip(),
                "question_type": "resume_project",
                "topic": result.get("topic", name),
            }
        except Exception:
            logger.exception("Failed to generate anchored question for project=%r", name)
            raise

    def generate_next_question(self, foundational_ratio: float = 0.6) -> dict[str, Any]:
        """Return the next interview question as a dict.

        Priority order:
        1. Recruiter custom questions (asked first, in order)
        2. Resume-anchored project questions (one per project, in order)
        3. LLM-generated questions (fill remaining slots)
        """
        if self._custom_questions_remaining:
            question_text = self._custom_questions_remaining.pop(0)
            return {
                "question_text": question_text,
                "question_type": "custom",
                "topic": "recruiter question",
            }

        if self._projects_to_probe:
            project = self._projects_to_probe.pop(0)
            try:
                return self._generate_anchored_project_question(project)
            except Exception:
                # Generation failed — put the project back and fall through to LLM.
                self._projects_to_probe.insert(0, project)
                logger.warning(
                    "Anchored question generation failed for project=%r — falling back to LLM",
                    project.get("name"),
                )

        covered_topics = [
            entry.get("topic", "") for entry in self.conversation_history if entry.get("topic")
        ]

        role_context = f" for a {self.job_title} role" if self.job_title else ""
        system_prompt = (
            f"You are an expert technical interviewer conducting an interview{role_context}. "
            f"Generate the next interview question that is specifically relevant to this role. "
            "Respond with ONLY a JSON object with keys: "
            '"question_text" (the full question), '
            '"question_type" ("foundational" or "project"), '
            '"topic" (a short 2-4 word label for the specific topic covered, e.g. "SQL query optimisation" or "React hooks lifecycle").'
        )

        user_content = self._build_generation_prompt(foundational_ratio, covered_topics)

        try:
            result = self._llm_json(system_prompt, user_content, temperature=0.7)
            return {
                "question_text": result.get("question_text", ""),
                "question_type": result.get("question_type", "foundational"),
                "topic": result.get("topic", "general"),
            }
        except Exception:
            logger.exception("Failed to generate next question via OpenAI")
            raise

    def should_follow_up(self, last_answer: str) -> bool:
        """Assess whether the last answer is vague and needs a follow-up probe."""
        last_question = self._last_question_text()
        if not last_question or not last_answer or not last_answer.strip():
            return False

        system_prompt = (
            "You are an expert technical interviewer evaluator. "
            "Determine whether the answer is vague, superficial, or "
            "lacks concrete technical detail. "
            'Respond with ONLY a JSON object: {"follow_up": true} or {"follow_up": false}.'
        )

        user_content = (
            f"Question asked:\n{last_question}\n\n"
            f"Candidate's answer:\n{last_answer}"
        )

        try:
            result = self._llm_json(system_prompt, user_content, temperature=0.0)
            return bool(result.get("follow_up", False))
        except Exception:
            logger.exception("Failed to evaluate follow-up need via OpenAI")
            return False

    def _last_question_text(self) -> str:
        if self.conversation_history:
            return self.conversation_history[-1].get("question", "")
        return ""

    def _build_generation_prompt(
        self, foundational_ratio: float, covered_topics: list[str]
    ) -> str:
        history_block = ""
        if self.conversation_history:
            formatted = "\n".join(
                f"Q: {entry.get('question', '')}\nA: {entry.get('answer', '')}"
                for entry in self.conversation_history
            )
            history_block = f"## Conversation so far\n{formatted}\n\n"

        covered_block = ""
        if covered_topics:
            covered_block = (
                f"## Topics already covered (DO NOT repeat)\n"
                f"{', '.join(covered_topics)}\n\n"
            )

        return (
            "## Candidate resume\n"
            f"{self.resume_markdown}\n\n"
            "## Job description requirements\n"
            f"{self.jd_text}\n\n"
            f"{history_block}"
            f"{covered_block}"
            "## Instructions\n"
            f"- Roughly {int(foundational_ratio * 100)}% of questions should be "
            f'"foundational" (core CS / engineering concepts relevant to the JD) '
            f"and {int((1 - foundational_ratio) * 100)}% should be \"project\" "
            f"(deep-dives into the candidate's resume projects and experience).\n"
            "- Ask deep, technical questions -- never surface-level or generic.\n"
            "- If the last answer was vague or incomplete, ask a targeted follow-up.\n"
            "- Do NOT repeat any topic that has already been covered.\n"
        )
