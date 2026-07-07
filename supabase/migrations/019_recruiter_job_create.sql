-- Allow recruiters to create and edit jobs/interview templates for their own org.
-- Previously recruiters only had SELECT (it_recruiter_select, hp_recruiter_select),
-- but the "create job" UI is reachable by recruiters and inserts into both tables,
-- causing 42501 RLS violations on interview_templates/hiring_posts.

DROP POLICY IF EXISTS "it_recruiter_select" ON interview_templates;
DROP POLICY IF EXISTS "hp_recruiter_select" ON hiring_posts;

CREATE POLICY "it_recruiter_all" ON interview_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = interview_templates.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = interview_templates.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    );

CREATE POLICY "hp_recruiter_all" ON hiring_posts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = hiring_posts.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = hiring_posts.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    );
