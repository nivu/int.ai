"""LLM service with rate limiting, queuing, and fallback mechanisms.

Addresses Bug 1 (LLM Response Latency) and Bug 10 (OpenAI Rate Limiting).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable

from openai import OpenAI, RateLimitError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.config import settings

logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Request queue and priority system
# ---------------------------------------------------------------------------

@dataclass
class LLMRequest:
    """Represents a queued LLM request with priority."""
    priority: int  # Lower number = higher priority (0 = active interview turn)
    session_id: str
    system_prompt: str
    user_content: str
    temperature: float
    callback: Callable[[dict], None]
    created_at: float


class LLMRequestQueue:
    """Priority queue for LLM requests with rate limiting."""
    
    def __init__(self, max_concurrent: int = 10, requests_per_minute: int = 50):
        self.queue: deque[LLMRequest] = deque()
        self.max_concurrent = max_concurrent
        self.requests_per_minute = requests_per_minute
        self.active_requests = 0
        self.request_timestamps: deque[float] = deque()
        self._lock = asyncio.Lock()
        self._processing = False
    
    async def enqueue(self, request: LLMRequest) -> None:
        """Add a request to the queue, sorted by priority."""
        async with self._lock:
            # Insert in priority order (lower priority number = higher priority)
            inserted = False
            for i, existing in enumerate(self.queue):
                if request.priority < existing.priority:
                    self.queue.insert(i, request)
                    inserted = True
                    break
            if not inserted:
                self.queue.append(request)
            
            logger.info(
                "LLM request queued priority=%d session=%s queue_size=%d",
                request.priority, request.session_id, len(self.queue)
            )
        
        # Start processing if not already running
        if not self._processing:
            asyncio.create_task(self._process_queue())
    
    async def _process_queue(self) -> None:
        """Process queued requests respecting rate limits."""
        if self._processing:
            return
        
        self._processing = True
        try:
            while True:
                async with self._lock:
                    if not self.queue:
                        break
                    
                    # Check rate limit
                    now = time.time()
                    # Remove timestamps older than 1 minute
                    while self.request_timestamps and now - self.request_timestamps[0] > 60:
                        self.request_timestamps.popleft()
                    
                    # Check if we can make another request
                    if len(self.request_timestamps) >= self.requests_per_minute:
                        # Wait until oldest request is >1 minute old
                        wait_time = 60 - (now - self.request_timestamps[0])
                        logger.warning(
                            "Rate limit reached, waiting %.1fs queue_size=%d",
                            wait_time, len(self.queue)
                        )
                        await asyncio.sleep(wait_time)
                        continue
                    
                    # Check concurrent limit
                    if self.active_requests >= self.max_concurrent:
                        await asyncio.sleep(0.1)
                        continue
                    
                    # Dequeue next request
                    request = self.queue.popleft()
                    self.active_requests += 1
                    self.request_timestamps.append(now)
                
                # Process request outside lock
                asyncio.create_task(self._execute_request(request))
        finally:
            self._processing = False
    
    async def _execute_request(self, request: LLMRequest) -> None:
        """Execute a single LLM request with retry logic."""
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                _call_llm_with_retry,
                request.system_prompt,
                request.user_content,
                request.temperature,
            )
            request.callback(result)
            logger.info(
                "LLM request completed session=%s latency=%.2fs",
                request.session_id, time.time() - request.created_at
            )
        except Exception as e:
            logger.exception("LLM request failed session=%s", request.session_id)
            # Call callback with error indicator
            request.callback({"error": str(e)})
        finally:
            async with self._lock:
                self.active_requests -= 1


# Global queue instance
_llm_queue = LLMRequestQueue(max_concurrent=10, requests_per_minute=50)


# ---------------------------------------------------------------------------
# LLM call with retry and fallback
# ---------------------------------------------------------------------------

@retry(
    retry=retry_if_exception_type(RateLimitError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
)
def _call_llm_with_retry(
    system_prompt: str,
    user_content: str,
    temperature: float,
) -> dict:
    """Call OpenAI with retry logic for rate limit errors."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value())
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            temperature=temperature,
            timeout=5.0,  # 5-second timeout to meet 2-second target with retries
        )
        import json
        return json.loads(response.choices[0].message.content)
    except RateLimitError:
        logger.warning("OpenAI rate limit hit, retrying...")
        raise
    except Exception as e:
        logger.exception("OpenAI call failed")
        raise


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_question_async(
    session_id: str,
    resume_markdown: str,
    jd_text: str,
    conversation_history: list[dict[str, str]],
    foundational_ratio: float = 0.6,
    priority: int = 0,
) -> dict[str, Any]:
    """Generate next interview question with queuing and fallback.
    
    Args:
        session_id: Interview session ID
        resume_markdown: Candidate's resume
        jd_text: Job description
        conversation_history: Previous Q&A exchanges
        foundational_ratio: Ratio of foundational vs project questions
        priority: Request priority (0 = active interview turn, higher = background)
    
    Returns:
        Dict with keys: question_text, question_type, topic
    """
    future: asyncio.Future[dict] = asyncio.Future()
    
    def callback(result: dict) -> None:
        if not future.done():
            future.set_result(result)
    
    # Build prompt
    covered_topics = [
        entry.get("topic", "") for entry in conversation_history if entry.get("topic")
    ]
    
    system_prompt = (
        "You are an expert technical interviewer. "
        "Generate the next interview question. "
        "Respond with ONLY a JSON object with keys: "
        '"question_text" (the full question), '
        '"question_type" ("foundational" or "project"), '
        '"topic" (a short label for the topic).'
    )
    
    user_content = _build_generation_prompt(
        resume_markdown, jd_text, conversation_history, foundational_ratio, covered_topics
    )
    
    request = LLMRequest(
        priority=priority,
        session_id=session_id,
        system_prompt=system_prompt,
        user_content=user_content,
        temperature=0.7,
        callback=callback,
        created_at=time.time(),
    )
    
    await _llm_queue.enqueue(request)
    
    # Wait for result with timeout
    try:
        result = await asyncio.wait_for(future, timeout=10.0)
        if "error" in result:
            # Fallback to cached question
            return _get_fallback_question(conversation_history)
        return result
    except asyncio.TimeoutError:
        logger.error("LLM request timeout session=%s", session_id)
        return _get_fallback_question(conversation_history)


def _build_generation_prompt(
    resume_markdown: str,
    jd_text: str,
    conversation_history: list[dict[str, str]],
    foundational_ratio: float,
    covered_topics: list[str],
) -> str:
    """Build the user prompt for question generation."""
    history_block = ""
    if conversation_history:
        formatted = "\n".join(
            f"Q: {entry.get('question', '')}\nA: {entry.get('answer', '')}"
            for entry in conversation_history
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
        f"{resume_markdown}\n\n"
        "## Job description requirements\n"
        f"{jd_text}\n\n"
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


def _get_fallback_question(conversation_history: list[dict[str, str]]) -> dict[str, Any]:
    """Return a cached fallback question when LLM fails."""
    # Simple fallback questions based on conversation length
    fallback_questions = [
        {
            "question_text": "Can you walk me through your most challenging technical project?",
            "question_type": "project",
            "topic": "project_experience",
        },
        {
            "question_text": "How do you approach debugging a complex issue in production?",
            "question_type": "foundational",
            "topic": "debugging",
        },
        {
            "question_text": "Tell me about a time you had to optimize system performance.",
            "question_type": "project",
            "topic": "optimization",
        },
        {
            "question_text": "How do you ensure code quality in your projects?",
            "question_type": "foundational",
            "topic": "code_quality",
        },
        {
            "question_text": "Describe your experience with system design and architecture.",
            "question_type": "foundational",
            "topic": "system_design",
        },
    ]
    
    # Use conversation length to cycle through fallback questions
    index = len(conversation_history) % len(fallback_questions)
    logger.warning("Using fallback question #%d", index)
    return fallback_questions[index]
