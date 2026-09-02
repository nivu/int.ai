"""int.ai backend entry point — FastAPI application."""

import asyncio
import logging
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Lifespan: optionally run a Celery worker inside the API process.
# Off by default — production runs a dedicated `celery` service. See
# Settings.RUN_EMBEDDED_WORKER.
# ---------------------------------------------------------------------------
_celery_proc: subprocess.Popen | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _celery_proc

    if not settings.RUN_EMBEDDED_WORKER:
        logger.info(
            '{"event": "embedded_worker_disabled", '
            '"detail": "tasks are handled by the dedicated celery service"}'
        )
        yield
        return

    _celery_proc = subprocess.Popen(  # noqa: ASYNC220 - must outlive this coroutine
        [sys.executable, "-m", "celery", "-A", "app.worker", "worker", "--loglevel=info", "--concurrency=2"],
        stdout=None,  # inherit so logs appear in the same terminal
        stderr=None,
    )
    logger.info("Celery worker started (pid=%d)", _celery_proc.pid)
    try:
        yield
    finally:
        if _celery_proc and _celery_proc.poll() is None:
            _celery_proc.terminate()
            # .wait() blocks; keep it off the event loop so shutdown stays responsive.
            await asyncio.to_thread(_shutdown_celery, _celery_proc)
            logger.info("Celery worker stopped")


def _shutdown_celery(proc: subprocess.Popen) -> None:
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="int.ai API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------
_allowed_origins = list(
    {
        settings.FRONTEND_URL.rstrip("/"),
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Structured request logging middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next: Any) -> Response:
    start = time.perf_counter()
    response: Response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)

    logger.info(
        '{"method": "%s", "path": "%s", "status_code": %d, "duration_ms": %.2f}',
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Mount API routers under /api/v1
# ---------------------------------------------------------------------------
def _mount_routers() -> None:
    import importlib

    router_modules = [
        ("app.api.screening", "router"),
        ("app.api.interview", "router"),
        ("app.api.email", "router"),
        ("app.api.webhooks", "router"),
        ("app.api.applications", "router"),
        ("app.api.jobs", "router"),
        ("app.api.invitations", "router"),
        ("app.api.reports", "router"),
    ]

    for module_path, attr_name in router_modules:
        module = importlib.import_module(module_path)
        router = getattr(module, attr_name)
        app.include_router(router, prefix="/api/v1")
        logger.info("Mounted router: %s", module_path)


_mount_routers()
