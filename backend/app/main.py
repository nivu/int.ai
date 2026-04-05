"""int.ai backend entry point — FastAPI application."""

import logging
import time
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
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="int.ai API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL.rstrip("/")],
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
