"""int.ai backend entry point — FastAPI application."""

import logging
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("int.ai")

# ---------------------------------------------------------------------------
# Lifespan: auto-start Celery worker alongside the API server
# ---------------------------------------------------------------------------
_celery_proc: subprocess.Popen | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _celery_proc
    _celery_proc = subprocess.Popen(
        [sys.executable, "-m", "celery", "-A", "app.worker", "worker", "--loglevel=info"],
        stdout=None,  # inherit so logs appear in the same terminal
        stderr=None,
    )
    logger.info("Celery worker started (pid=%d)", _celery_proc.pid)
    try:
        yield
    finally:
        if _celery_proc and _celery_proc.poll() is None:
            _celery_proc.terminate()
            try:
                _celery_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                _celery_proc.kill()
            logger.info("Celery worker stopped")


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
    """Import and mount API routers.  Routers that haven't been created yet
    are silently skipped so the app can start during incremental development."""

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
        try:
            import importlib

            module = importlib.import_module(module_path)
            router = getattr(module, attr_name)
            app.include_router(router, prefix="/api/v1")
        except (ImportError, AttributeError) as exc:
            logger.warning(
                'Router "%s" not yet available, skipping: %s', module_path, exc
            )


_mount_routers()
