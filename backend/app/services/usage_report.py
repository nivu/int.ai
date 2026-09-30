"""Usage summaries over ``ai_usage`` for the Settings → Usage tab and the MCP
``get_usage`` tool.

``fetch_usage_rows`` reads an org's rows for a period (paged, because
PostgREST caps a single response at 1000 rows); ``summarize_usage`` is pure so
it can be unit-tested without a database.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

_ROW_COLUMNS = (
    "provider, model, operation, input_tokens, output_tokens, duration_seconds, "
    "characters, cost_usd, status, hiring_post_id, created_at"
)
_PAGE_SIZE = 1000


def _db():
    # Imported lazily so the pure helpers here can be unit-tested without
    # Supabase credentials in the environment.
    from app.services.supabase import supabase

    return supabase


def fetch_usage_rows(org_id: str, since: datetime) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        page = (
            _db()
            .table("ai_usage")
            .select(_ROW_COLUMNS)
            .eq("org_id", org_id)
            .gte("created_at", since.isoformat())
            .order("created_at")
            .range(start, start + _PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            return rows
        start += _PAGE_SIZE


def _job_titles(job_ids: list[str]) -> dict[str, str]:
    if not job_ids:
        return {}
    rows = _db().table("hiring_posts").select("id, title").in_("id", job_ids).execute().data or []
    return {r["id"]: r["title"] for r in rows}


def _operation_key(operation: str) -> str:
    """Group per-question evaluation calls (evaluate:score_q1, _q2, ...) into one row."""
    return re.sub(r"^evaluate:score_q\d+$", "evaluate:score_question", operation)


def summarize_usage(
    rows: list[dict[str, Any]],
    *,
    since: datetime,
    until: datetime,
    job_titles: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Totals plus breakdowns by day, provider, operation and job."""
    job_titles = job_titles or {}

    by_day: dict[str, float] = {}
    day = since.date()
    while day <= until.date():
        by_day[day.isoformat()] = 0.0
        day += timedelta(days=1)

    providers: dict[str, dict[str, float]] = defaultdict(
        lambda: {"calls": 0, "errors": 0, "cost_usd": 0.0}
    )
    operations: dict[tuple[str, str], dict[str, float]] = defaultdict(
        lambda: {
            "calls": 0,
            "errors": 0,
            "cost_usd": 0.0,
            "input_tokens": 0,
            "output_tokens": 0,
            "duration_seconds": 0.0,
            "characters": 0,
        }
    )
    jobs: dict[str | None, dict[str, float]] = defaultdict(lambda: {"calls": 0, "cost_usd": 0.0})

    total_cost = 0.0
    total_errors = 0
    for r in rows:
        cost = float(r.get("cost_usd") or 0)
        failed = r.get("status") == "error"
        total_cost += cost
        total_errors += failed

        created_day = str(r.get("created_at", ""))[:10]
        if created_day in by_day:
            by_day[created_day] += cost

        p = providers[r["provider"]]
        p["calls"] += 1
        p["errors"] += failed
        p["cost_usd"] += cost

        o = operations[(r["provider"], _operation_key(r["operation"]))]
        o["calls"] += 1
        o["errors"] += failed
        o["cost_usd"] += cost
        o["input_tokens"] += int(r.get("input_tokens") or 0)
        o["output_tokens"] += int(r.get("output_tokens") or 0)
        o["duration_seconds"] += float(r.get("duration_seconds") or 0)
        o["characters"] += int(r.get("characters") or 0)

        j = jobs[r.get("hiring_post_id")]
        j["calls"] += 1
        j["cost_usd"] += cost

    return {
        "since": since.isoformat(),
        "until": until.isoformat(),
        "total_cost_usd": round(total_cost, 6),
        "total_calls": len(rows),
        "error_calls": total_errors,
        "by_day": [{"date": d, "cost_usd": round(c, 6)} for d, c in by_day.items()],
        "by_provider": sorted(
            (
                {
                    "provider": k,
                    "calls": int(v["calls"]),
                    "errors": int(v["errors"]),
                    "cost_usd": round(v["cost_usd"], 6),
                }
                for k, v in providers.items()
            ),
            key=lambda x: -x["cost_usd"],
        ),
        "by_operation": sorted(
            (
                {
                    "provider": prov,
                    "operation": op,
                    "calls": int(v["calls"]),
                    "errors": int(v["errors"]),
                    "cost_usd": round(v["cost_usd"], 6),
                    "input_tokens": int(v["input_tokens"]),
                    "output_tokens": int(v["output_tokens"]),
                    "duration_seconds": round(v["duration_seconds"], 1),
                    "characters": int(v["characters"]),
                }
                for (prov, op), v in operations.items()
            ),
            key=lambda x: -x["cost_usd"],
        ),
        "by_job": sorted(
            (
                {
                    "job_id": job_id,
                    "title": job_titles.get(job_id, "Unknown job")
                    if job_id
                    else "Not tied to a job",
                    "calls": int(v["calls"]),
                    "cost_usd": round(v["cost_usd"], 6),
                }
                for job_id, v in jobs.items()
            ),
            key=lambda x: -x["cost_usd"],
        ),
    }


def usage_summary(org_id: str, days: int) -> dict[str, Any]:
    until = datetime.now(UTC)
    since = (until - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = fetch_usage_rows(org_id, since)
    titles = _job_titles(sorted({r["hiring_post_id"] for r in rows if r.get("hiring_post_id")}))
    return summarize_usage(rows, since=since, until=until, job_titles=titles)
