-- 005_functions.sql
-- Database functions and triggers

-- ============================================================
-- 1. auto_close_expired_posts()
-- Closes hiring posts that have passed their closes_at date.
-- Intended to be called via pg_cron or a scheduled Edge Function.
-- ============================================================
CREATE OR REPLACE FUNCTION auto_close_expired_posts()
RETURNS void
LANGUAGE sql
AS $$
    UPDATE hiring_posts
    SET status = 'closed',
        updated_at = now()
    WHERE closes_at < now()
      AND status = 'published';
$$;

-- ============================================================
-- 2. generate_share_slug()
-- Trigger function: generates a random 8-char alphanumeric slug
-- on INSERT into hiring_posts if share_slug is not provided.
-- ============================================================
CREATE OR REPLACE FUNCTION generate_share_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
    slug text := '';
    i integer;
BEGIN
    IF NEW.share_slug IS NULL THEN
        FOR i IN 1..8 LOOP
            slug := slug || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
        END LOOP;
        NEW.share_slug := slug;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hiring_posts_share_slug
    BEFORE INSERT ON hiring_posts
    FOR EACH ROW
    EXECUTE FUNCTION generate_share_slug();

-- ============================================================
-- 3. compute_overall_score()
-- Trigger function: recalculates the weighted overall_score on
-- applications UPDATE using the hiring post's scoring_weights.
-- ============================================================
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

        w_skill      := COALESCE((weights->>'skill')::real, 0.35);
        w_experience := COALESCE((weights->>'experience')::real, 0.30);
        w_culture    := COALESCE((weights->>'culture')::real, 0.20);
        w_embedding  := COALESCE((weights->>'embedding')::real, 0.15);

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

CREATE TRIGGER trg_applications_compute_score
    BEFORE UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION compute_overall_score();

-- ============================================================
-- 4. update_updated_at()
-- Generic trigger function to auto-set updated_at on UPDATE.
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_hiring_posts_updated_at
    BEFORE UPDATE ON hiring_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_interview_templates_updated_at
    BEFORE UPDATE ON interview_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
