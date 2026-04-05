"""AI interview question generator powered by Gemini.

Produces contextual, non-repetitive technical interview questions based on the
candidate's resume, the job description, and the conversation so far.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Gemini client (module-level, reused across calls)
# ---------------------------------------------------------------------------
_client = genai.Client(api_key=settings.GEMINI_API_KEY.get_secret_value())

_MODEL = "gemini-2.0-flash"


# ---------------------------------------------------------------------------
# QuestionGenerator
# ---------------------------------------------------------------------------
class QuestionGenerator:
    """Generates contextual interview questions using Gemini.

    Parameters
    ----------
    resume_markdown:
        The candidate's resume converted to Markdown.
    jd_text:
        The full job-description text.
    conversation_history:
        List of ``{"question": ..., "answer": ...}`` dicts representing the
        interview so far.
    """

    def __init__(
        self,
        resume_markdown: str,
        jd_text: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> None:
        self.resume_markdown = resume_markdown
        self.jd_text = jd_text
        self.conversation_history: list[dict[str, str]] = conversation_history or []

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def generate_next_question(self, foundational_ratio: float = 0.6) -> dict[str, Any]:
        """Return the next interview question as a dict.

        Returns
        -------
        dict
            ``{"question_text": str, "question_type": "foundational"|"project",
              "topic": str}``
        """
        covered_topics = [
            entry.get("topic", "") for entry in self.conversation_history if entry.get("topic")
        ]

        prompt = self._build_generation_prompt(foundational_ratio, covered_topics)

        try:
            response = _client.models.generate_content(
                model=_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    response_mime_type="application/json",
                ),
            )

            result = json.loads(response.text)

            # Normalise keys to expected schema
            question: dict[str, Any] = {
                "question_text": result.get("question_text", ""),
                "question_type": result.get("question_type", "foundational"),
                "topic": result.get("topic", "general"),
            }
            return question

        except Exception:
            logger.exception("Failed to generate next question via Gemini")
            raise

    def should_follow_up(self, last_answer: str) -> bool:
        """Assess whether *last_answer* is vague and requires a follow-up probe.

        Returns ``True`` when the answer lacks specificity and the interviewer
        should dig deeper before moving on.
        """
        prompt = (
            "You are an expert technical interviewer evaluator.\n\n"
            "Determine whether the following answer is vague, superficial, or "
            "lacks concrete technical detail.  Respond with ONLY a JSON object: "
            '{"follow_up": true} or {"follow_up": false}.\n\n'
            f"Question asked:\n{self._last_question_text()}\n\n"
            f"Candidate's answer:\n{last_answer}"
        )

        try:
            response = _client.models.generate_content(
                model=_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.0,
                    response_mime_type="application/json",
                ),
            )

            result = json.loads(response.text)
            return bool(result.get("follow_up", False))

        except Exception:
            logger.exception("Failed to evaluate follow-up need via Gemini")
            # Default to not following up on failure so the interview proceeds.
            return False

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

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
            "You are an expert technical interviewer.\n\n"
            "## Candidate resume\n"
            f"{self.resume_markdown}\n\n"
            "## Job description requirements\n"
            f"{self.jd_text}\n\n"
            f"{history_block}"
            f"{covered_block}"
            "## Instructions\n"
            f"- Roughly {int(foundational_ratio * 100)}% of questions should be "
            f"\"foundational\" (core CS / engineering concepts relevant to the JD) "
            f"and {int((1 - foundational_ratio) * 100)}% should be \"project\" "
            f"(deep-dives into the candidate's resume projects and experience).\n"
            "- Ask deep, technical questions -- never surface-level or generic.\n"
            "- If the last answer was vague or incomplete, ask a targeted follow-up "
            "that probes for specifics instead of moving to a new topic.\n"
            "- Do NOT repeat any topic that has already been covered.\n"
            "- Pick the question type that best balances the ratio given the "
            "conversation so far.\n\n"
            "Respond with ONLY a JSON object with these keys:\n"
            '  "question_text": the full question to ask the candidate,\n'
            '  "question_type": "foundational" or "project",\n'
            '  "topic": a short label for the topic this question covers.'
        )
