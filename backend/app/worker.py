"""Celery worker configuration for int.ai background tasks."""

import ssl

from celery import Celery

from app.config import settings

# ---------------------------------------------------------------------------
# Celery application
# ---------------------------------------------------------------------------

redis_url = str(settings.REDIS_URL)

celery_app = Celery(
    "int_ai",
    broker=redis_url,
    backend=redis_url,
)

# SSL config for rediss:// (Upstash, etc.)
if redis_url.startswith("rediss://"):
    celery_app.conf.broker_use_ssl = {"ssl_cert_reqs": ssl.CERT_NONE}
    celery_app.conf.redis_backend_use_ssl = {"ssl_cert_reqs": ssl.CERT_NONE}

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_time_limit=600,  # 10 minutes max per task
)

# Auto-discover tasks in the app.tasks package
celery_app.autodiscover_tasks(["app.tasks"])
