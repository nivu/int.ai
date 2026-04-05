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
        conversation_history: list[dict[str, str]] | None = None,
    ) -> None:
        self.resume_markdown = resume_markdown
        self.jd_text = jd_text
        self.conversation_history: list[dict[str, str]] = conversation_history or []

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

    def generate_next_question(self, foundational_ratio: float = 0.6) -> dict[str, Any]:
        """Return the next interview question as a dict."""
        covered_topics = [
            entry.get("topic", "") for entry in self.conversation_history if entry.get("topic")
        ]

        system_prompt = (
            "You are an expert technical interviewer. "
            "Generate the next interview question. "
            "Respond with ONLY a JSON object with keys: "
            '"question_text" (the full question), '
            '"question_type" ("foundational" or "project"), '
            '"topic" (a short label for the topic).'
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
        system_prompt = (
            "You are an expert technical interviewer evaluator. "
            "Determine whether the answer is vague, superficial, or "
            "lacks concrete technical detail. "
            'Respond with ONLY a JSON object: {"follow_up": true} or {"follow_up": false}.'
        )

        user_content = (
            f"Question asked:\n{self._last_question_text()}\n\n"
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
