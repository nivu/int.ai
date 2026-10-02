-- Independent scoring dimensions (spec 001 FR-007a/b, FR-008, FR-008a).
--
-- 1. Per-post cut-offs for skill, experience and culture match. They are shown
--    as met / missed on the score breakdown and do not gate auto-advance.
--    Existing posts are backfilled relative to their screening threshold T:
--    skill T, experience T-10, culture T-20 (clamped to 0-100).
-- 2. An internal culture expectation used by culture scoring. It lives in its
--    own table because hiring_posts rows are readable by anonymous visitors
--    (published posts) and by candidates (posts they applied to); RLS is
--    row-level, so a column on hiring_posts would be readable by them too.
-- 3. compute_overall_score() now uses fixed weights — embedding 0.15,
--    skill 0.35, experience 0.35, culture 0.15. hiring_posts.scoring_weights
--    is no longer read; it now defaults to the fixed weights so writers need
--    not send it.

ALTER TABLE hiring_posts
    ADD COLUMN skill_cutoff integer NOT NULL DEFAULT 70 CHECK (skill_cutoff BETWEEN 0 AND 100),
    ADD COLUMN experience_cutoff integer NOT NULL DEFAULT 60 CHECK (experience_cutoff BETWEEN 0 AND 100),
    ADD COLUMN culture_cutoff integer NOT NULL DEFAULT 50 CHECK (culture_cutoff BETWEEN 0 AND 100);

ALTER TABLE hiring_posts ALTER COLUMN scoring_weights SET DEFAULT
    '{"embedding_similarity": 0.15, "skill_match": 0.35, "experience_match": 0.35, "culture_match": 0.15}'::jsonb;

UPDATE hiring_posts SET
    skill_cutoff      = GREATEST(0, LEAST(100, COALESCE(screening_threshold, 70))),
    experience_cutoff = GREATEST(0, LEAST(100, COALESCE(screening_threshold, 70) - 10)),
    culture_cutoff    = GREATEST(0, LEAST(100, COALESCE(screening_threshold, 70) - 20));

CREATE TABLE hiring_post_private (
    hiring_post_id uuid PRIMARY KEY REFERENCES hiring_posts(id) ON DELETE CASCADE,
    culture_expectation text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hiring_post_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hpp_staff_all" ON hiring_post_private FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM hiring_posts hp
            WHERE hp.id = hiring_post_private.hiring_post_id
              AND is_org_member(hp.org_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM hiring_posts hp
            WHERE hp.id = hiring_post_private.hiring_post_id
              AND is_org_member(hp.org_id)
        )
    );

CREATE OR REPLACE FUNCTION compute_overall_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only compute if individual scores are present
    IF NEW.skill_match_score IS NOT NULL
       AND NEW.experience_match_score IS NOT NULL
       AND NEW.culture_match_score IS NOT NULL
    THEN
        NEW.overall_score := GREATEST(0, LEAST(1,
            0.15 * COALESCE(NEW.embedding_score, 0) +
            0.35 * NEW.skill_match_score +
            0.35 * NEW.experience_match_score +
            0.15 * NEW.culture_match_score
        ));
    END IF;

    RETURN NEW;
END;
$$;
