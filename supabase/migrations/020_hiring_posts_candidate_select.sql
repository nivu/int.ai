-- Candidates could read their own applications and interview sessions, but
-- had no RLS policy to read the hiring_posts row for a job they applied to.
-- Once a post was no longer 'published' (closed/archived) or lacked a
-- share_slug, the candidate portal's join on hiring_posts silently returned
-- null, showing "Untitled Position" / "General" instead of the real job.

CREATE POLICY "hp_candidate_select" ON hiring_posts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM applications
            JOIN candidates ON candidates.id = applications.candidate_id
            WHERE applications.hiring_post_id = hiring_posts.id
              AND candidates.auth_user_id = auth.uid()
        )
    );
