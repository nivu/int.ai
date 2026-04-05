# Import tasks so Celery autodiscover can find them
from app.tasks.screen_resume import screen_resume_task  # noqa: F401
from app.tasks.evaluate_interview import evaluate_interview_task  # noqa: F401
