-- compute_overall_score() computed overall_score as a raw weighted sum with
-- no normalization by total weight and no clamp. When a hiring post's
-- scoring_weights only partially override the defaults, the four weights
-- actually used (skill_match, experience_match, culture_match,
-- embedding_similarity) can sum to more than 1.0, producing an overall_score
-- above 1.0 (displayed as e.g. 102%). This mirrors the already-correct
-- normalize-and-clamp logic in backend/app/services/scoring.py.

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
    total_weight real;
    weighted_sum real;
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

        total_weight := w_skill + w_experience + w_culture + w_embedding;
        weighted_sum := (
            w_skill * COALESCE(NEW.skill_match_score, 0) +
            w_experience * COALESCE(NEW.experience_match_score, 0) +
            w_culture * COALESCE(NEW.culture_match_score, 0) +
            w_embedding * COALESCE(NEW.embedding_score, 0)
        );

        NEW.overall_score := CASE
            WHEN total_weight = 0 THEN 0
            ELSE GREATEST(0, LEAST(1, weighted_sum / total_weight))
        END;
    END IF;

    RETURN NEW;
END;
$$;
