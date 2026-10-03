"""Celery task to recompute an application's screening scores (spec 001 FR-008b).

Scores only: never changes application status, creates interview sessions,
or sends email.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from app.services.scoring import (
    compute_overall_score,
    load_culture_expectation,
    score_all_dimensions,
    score_embedding_similarity,
)
from app.services.supabase import get_record, supabase, update_record
from app.services.usage import reset_usage_context, set_usage_context
from app.tasks.screen_resume import download_resume_text
from app.worker import celery_app

logger = logging.getLogger("int.ai")


@celery_app.task(bind=True, name="rescore_application_task", max_retries=1)
def rescore_application_task(self, application_id: str) -> dict:
    """Re-run embedding, skill, experience and culture scoring for one application."""
    usage_token = None
    try:
        application = get_record("applications", application_id)
        hiring_post_id = application["hiring_post_id"]
        hiring_post = get_record("hiring_posts", hiring_post_id)
        usage_token = set_usage_context(
            org_id=hiring_post.get("org_id"),
            hiring_post_id=hiring_post_id,
            application_id=application_id,
        )

        jd_text: str = hiring_post.get("description", "")
        jd_skills: list[str] = hiring_post.get("required_skills", []) or []
        culture_expectation = load_culture_expectation(hiring_post_id)
        resume_text = download_resume_text(application["resume_url"])

        with ThreadPoolExecutor(max_workers=2) as pool:
            fut_embed = pool.submit(score_embedding_similarity, resume_text, jd_text)
            fut_scores = pool.submit(
                score_all_dimensions, resume_text, jd_text, jd_skills, culture_expectation,
            )
            embedding_score = fut_embed.result()
            (
                skill_score, skill_details,
                experience_score, experience_details,
                culture_score, culture_details,
            ) = fut_scores.result()

        overall_score = compute_overall_score({
            "embedding_similarity": embedding_score,
            "skill_match": skill_score,
            "experience_match": experience_score,
            "culture_match": culture_score,
        })

        supabase.table("resume_data").update({
            "resume_text": resume_text,
            "skill_match_details": skill_details,
            "experience_match_details": experience_details,
            "culture_match_details": culture_details,
        }).eq("application_id", application_id).execute()

        update_record("applications", application_id, {
            "embedding_score": round(embedding_score, 4),
            "skill_match_score": round(skill_score, 4),
            "experience_match_score": round(experience_score, 4),
            "culture_match_score": round(culture_score, 4),
            "overall_score": round(overall_score, 4),
        })

        logger.info(
            "Rescore complete for application=%s overall=%.3f "
            "(embed=%.3f skill=%.3f exp=%.3f culture=%.3f)",
            application_id, overall_score,
            embedding_score, skill_score, experience_score, culture_score,
        )
        return {"application_id": application_id, "overall_score": round(overall_score, 4)}

    except Exception:
        logger.exception("Rescore failed for application=%s", application_id)
        raise
    finally:
        if usage_token is not None:
            reset_usage_context(usage_token)
