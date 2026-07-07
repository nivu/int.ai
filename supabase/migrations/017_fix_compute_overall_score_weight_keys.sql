-- compute_overall_score() (005_functions.sql) read scoring-weight keys
-- (skill, experience, culture, embedding) that never matched what the
-- backend actually stores in hiring_posts.scoring_weights (skill_match,
-- experience_match, culture_match, embedding_similarity). Every application's
-- overall_score was silently recomputed on UPDATE using hardcoded defaults
-- instead of the recruiter's configured weights, overwriting the value the
-- backend had just computed and set in the same statement.

CREATE OR REPLACE FUNCTION compute_overall_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    weights jsonb;
    w_skill real;
    w_experience real;
    w_culture real;
    w_embedding real;
BEGIN
    -- Only compute if individual scores are present
    IF NEW.skill_match_score IS NOT NULL
       AND NEW.experience_match_score IS NOT NULL
       AND NEW.culture_match_score IS NOT NULL
    THEN
        SELECT hp.scoring_weights INTO weights
        FROM hiring_posts hp
        WHERE hp.id = NEW.hiring_post_id;

        w_skill      := COALESCE((weights->>'skill_match')::real, 0.35);
        w_experience := COALESCE((weights->>'experience_match')::real, 0.25);
        w_culture    := COALESCE((weights->>'culture_match')::real, 0.20);
        w_embedding  := COALESCE((weights->>'embedding_similarity')::real, 0.20);

        NEW.overall_score := (
            w_skill * COALESCE(NEW.skill_match_score, 0) +
            w_experience * COALESCE(NEW.experience_match_score, 0) +
            w_culture * COALESCE(NEW.culture_match_score, 0) +
            w_embedding * COALESCE(NEW.embedding_score, 0)
        );
    END IF;

    RETURN NEW;
END;
$$;
