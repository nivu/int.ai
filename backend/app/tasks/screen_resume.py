"""Celery task for automated resume screening pipeline."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.services import email as email_service
from app.services.embeddings import embed_text, store_embedding
from app.services.resume_parser import process_resume
from app.services.scoring import (
    compute_overall_score,
    score_culture_match,
    score_embedding_similarity,
    score_experience_match,
    score_skill_match,
)
from app.services.supabase import get_record, get_signed_url, insert_record, supabase, update_record
from app.worker import celery_app

logger = logging.getLogger("int.ai")

# Auto-advance thresholds (offset applied relative to hiring post threshold)
REVIEW_BAND = 5  # points below threshold that still warrant human review


@celery_app.task(bind=True, name="screen_resume_task", max_retries=2)
def screen_resume_task(self, application_id: str, hiring_post_id: str) -> dict:
    """Run the full resume screening pipeline for a single application.

    Steps:
        1. Fetch application and hiring_post from Supabase
        2. Download resume file from Supabase Storage
        3. Parse resume
        4. Store parsed data in resume_data table
        5. Compute embedding similarity score
        6. Run LLM skill, experience, and culture match
        7. Compute overall weighted score
        8. Update application with scores and status
        9. Store embedding
        10. Auto-advance logic
    """
    try:
        # 1. Fetch records
        application = get_record("applications", application_id)
        hiring_post = get_record("hiring_posts", hiring_post_id)

        resume_path: str = application["resume_url"]
        job_title: str = hiring_post.get("title", "")
        jd_text: str = hiring_post.get("description", "")
        jd_skills: list[str] = hiring_post.get("required_skills", []) or []
        scoring_weights: dict | None = hiring_post.get("scoring_weights")
        threshold: float = float(hiring_post.get("screening_threshold", 70)) / 100.0

        # 2. Download resume from Supabase Storage
        bucket = "resumes"
        file_bytes = supabase.storage.from_(bucket).download(resume_path)

        filename = resume_path.rsplit("/", maxsplit=1)[-1] if "/" in resume_path else resume_path

        # 3. Parse resume
        logger.info("Parsing resume for application=%s", application_id)
        parsed = process_resume(file_bytes, filename)

        # 4. Store parsed data in resume_data table
        resume_data_record = insert_record("resume_data", {
            "application_id": application_id,
            "name": parsed.get("name", ""),
            "email": parsed.get("email", ""),
            "education": parsed.get("education", []),
            "experience": parsed.get("experience", []),
            "skills": parsed.get("skills", []),
            "projects": parsed.get("projects", []),
            "certifications": parsed.get("certifications", []),
            "summary": parsed.get("summary", ""),
            "raw_markdown": parsed.get("raw_markdown", ""),
            "raw_text": parsed.get("raw_text", ""),
        })
        resume_data_id = resume_data_record["id"]

        # 5. Embedding similarity
        resume_text = parsed.get("raw_text", "")
        embedding_score = score_embedding_similarity(resume_text, jd_text)

        # 6. LLM-based scoring
        skill_score, skill_details = score_skill_match(resume_text, jd_skills)
        experience_score, experience_details = score_experience_match(resume_text, jd_text)
        culture_score, culture_details = score_culture_match(resume_text, jd_text)

        # 7. Compute overall weighted score
        scores = {
            "embedding_similarity": embedding_score,
            "skill_match": skill_score,
            "experience_match": experience_score,
            "culture_match": culture_score,
        }
        overall_score = compute_overall_score(scores, scoring_weights)

        logger.info(
            "Screening complete for application=%s overall=%.3f "
            "(embed=%.3f skill=%.3f exp=%.3f culture=%.3f)",
            application_id, overall_score,
            embedding_score, skill_score, experience_score, culture_score,
        )

        # 8. Update application with scores and status
        update_data = {
            "screening_scores": {
                **scores,
                "overall": overall_score,
                "skill_details": skill_details,
                "experience_details": experience_details,
                "culture_details": culture_details,
            },
            "overall_score": round(overall_score * 100, 2),
            "status": "screened",
        }
        update_record("applications", application_id, update_data)

        # 9. Store embedding in resume_data
        resume_embedding = embed_text(resume_text)
        store_embedding(resume_data_id, resume_embedding)

        # 10. Auto-advance logic
        rejection_threshold = threshold - (REVIEW_BAND / 100.0)

        if overall_score >= threshold:
            # Auto-advance to interview
            interview_deadline = (
                datetime.now(timezone.utc) + timedelta(days=7)
            ).strftime("%B %d, %Y")

            portal_url = f"{settings.FRONTEND_URL}/applications/{application_id}"

            update_record("applications", application_id, {"status": "interview_sent"})

            candidate_email = parsed.get("email") or application.get("candidate_email", "")
            candidate_name = parsed.get("name") or application.get("candidate_name", "")

            if candidate_email:
                try:
                    email_service.send_interview_invitation(
                        candidate_email=candidate_email,
                        candidate_name=candidate_name,
                        job_title=job_title,
                        interview_deadline=interview_deadline,
                        portal_url=portal_url,
                    )
                    logger.info("Interview invitation sent to %s", candidate_email)
                except Exception:
                    logger.exception("Failed to send interview invitation for application=%s", application_id)

        elif overall_score < rejection_threshold:
            update_record("applications", application_id, {"status": "rejected"})
            logger.info("Application %s auto-rejected (score=%.3f)", application_id, overall_score)
        else:
            # Score is between rejection_threshold and threshold — flag for review
            logger.info("Application %s flagged for review (score=%.3f)", application_id, overall_score)

        return {
            "application_id": application_id,
            "overall_score": round(overall_score * 100, 2),
            "status": "completed",
        }

    except Exception as exc:
        logger.exception("Resume screening failed for application=%s", application_id)
        try:
            update_record("applications", application_id, {
                "status": "screening_error",
                "screening_error": str(exc),
            })
        except Exception:
            logger.exception("Failed to update application error status for %s", application_id)
        raise
