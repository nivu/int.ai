-- 007_interview_sessions_admin_insert.sql
-- Allow admins to create interview sessions for applications in their org.
-- Previously only the service-role (backend Celery task) could insert,
-- which caused the manual "Send Interview" action in the admin UI to silently
-- fail — the application status was updated to interview_sent but no session
-- was created, leaving candidates with "No Interview Available".

CREATE POLICY "is_admin_insert" ON interview_sessions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM applications
            JOIN hiring_posts ON hiring_posts.id = applications.hiring_post_id
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE applications.id = interview_sessions.application_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    );
