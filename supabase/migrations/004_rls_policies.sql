-- 004_rls_policies.sql
-- Row Level Security policies for all tables

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hiring_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_qa ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_reports ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: get the current user's team membership for an org
-- ============================================================

-- ============================================================
-- organizations
-- ============================================================

-- Admin: full access to own org
CREATE POLICY "org_admin_all" ON organizations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = organizations.id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = organizations.id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    );

-- Recruiter: read own org
CREATE POLICY "org_recruiter_select" ON organizations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = organizations.id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    );

-- ============================================================
-- team_members
-- ============================================================

-- Admin: full access to own org members
CREATE POLICY "tm_admin_all" ON team_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members AS me
            WHERE me.org_id = team_members.org_id
              AND me.user_id = auth.uid()
              AND me.role = 'admin'
              AND me.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members AS me
            WHERE me.org_id = team_members.org_id
              AND me.user_id = auth.uid()
              AND me.role = 'admin'
              AND me.status = 'active'
        )
    );

-- Recruiter: read self
CREATE POLICY "tm_recruiter_self_select" ON team_members
    FOR SELECT
    USING (
        team_members.user_id = auth.uid()
        AND team_members.role = 'recruiter'
    );

-- ============================================================
-- interview_templates
-- ============================================================

-- Admin: full access to own org templates
CREATE POLICY "it_admin_all" ON interview_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = interview_templates.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = interview_templates.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    );

-- Recruiter: read own org templates
CREATE POLICY "it_recruiter_select" ON interview_templates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = interview_templates.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    );

-- ============================================================
-- hiring_posts
-- ============================================================

-- Admin: full access to own org posts
CREATE POLICY "hp_admin_all" ON hiring_posts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = hiring_posts.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = hiring_posts.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    );

-- Recruiter: read own org posts (assigned = same org)
CREATE POLICY "hp_recruiter_select" ON hiring_posts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.org_id = hiring_posts.org_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    );

-- Anon: read published posts via share_slug (for public job listings)
CREATE POLICY "hp_anon_published_select" ON hiring_posts
    FOR SELECT
    USING (
        hiring_posts.status = 'published'
        AND hiring_posts.share_slug IS NOT NULL
    );

-- ============================================================
-- candidates
-- ============================================================

-- Admin/Recruiter: read candidates who have applications in own org
CREATE POLICY "cand_staff_select" ON candidates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM applications
            JOIN hiring_posts ON hiring_posts.id = applications.hiring_post_id
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE applications.candidate_id = candidates.id
              AND team_members.user_id = auth.uid()
              AND team_members.role IN ('admin', 'recruiter')
              AND team_members.status = 'active'
        )
    );

-- Candidate: read self (matched by auth_user_id)
CREATE POLICY "cand_self_select" ON candidates
    FOR SELECT
    USING (
        candidates.auth_user_id = auth.uid()
    );

-- ============================================================
-- applications
-- ============================================================

-- Admin: full access to own org applications
CREATE POLICY "app_admin_all" ON applications
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM hiring_posts
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE hiring_posts.id = applications.hiring_post_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM hiring_posts
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE hiring_posts.id = applications.hiring_post_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'admin'
              AND team_members.status = 'active'
        )
    );

-- Recruiter: read and update own org applications
CREATE POLICY "app_recruiter_select" ON applications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM hiring_posts
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE hiring_posts.id = applications.hiring_post_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    );

CREATE POLICY "app_recruiter_update" ON applications
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM hiring_posts
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE hiring_posts.id = applications.hiring_post_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM hiring_posts
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE hiring_posts.id = applications.hiring_post_id
              AND team_members.user_id = auth.uid()
              AND team_members.role = 'recruiter'
              AND team_members.status = 'active'
        )
    );

-- Candidate: read own applications
CREATE POLICY "app_candidate_select" ON applications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM candidates
            WHERE candidates.id = applications.candidate_id
              AND candidates.auth_user_id = auth.uid()
        )
    );

-- ============================================================
-- resume_data
-- ============================================================

-- Admin/Recruiter: read own org resume data
CREATE POLICY "rd_staff_select" ON resume_data
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM applications
            JOIN hiring_posts ON hiring_posts.id = applications.hiring_post_id
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE applications.id = resume_data.application_id
              AND team_members.user_id = auth.uid()
              AND team_members.role IN ('admin', 'recruiter')
              AND team_members.status = 'active'
        )
    );

-- ============================================================
-- interview_sessions
-- ============================================================

-- Admin/Recruiter: read own org sessions
CREATE POLICY "is_staff_select" ON interview_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM applications
            JOIN hiring_posts ON hiring_posts.id = applications.hiring_post_id
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE applications.id = interview_sessions.application_id
              AND team_members.user_id = auth.uid()
              AND team_members.role IN ('admin', 'recruiter')
              AND team_members.status = 'active'
        )
    );

-- Candidate: read and update own session
CREATE POLICY "is_candidate_select" ON interview_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM applications
            JOIN candidates ON candidates.id = applications.candidate_id
            WHERE applications.id = interview_sessions.application_id
              AND candidates.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "is_candidate_update" ON interview_sessions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM applications
            JOIN candidates ON candidates.id = applications.candidate_id
            WHERE applications.id = interview_sessions.application_id
              AND candidates.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM applications
            JOIN candidates ON candidates.id = applications.candidate_id
            WHERE applications.id = interview_sessions.application_id
              AND candidates.auth_user_id = auth.uid()
        )
    );

-- ============================================================
-- interview_qa
-- ============================================================

-- Admin/Recruiter: read own org QA
CREATE POLICY "iqa_staff_select" ON interview_qa
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interview_sessions
            JOIN applications ON applications.id = interview_sessions.application_id
            JOIN hiring_posts ON hiring_posts.id = applications.hiring_post_id
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE interview_sessions.id = interview_qa.session_id
              AND team_members.user_id = auth.uid()
              AND team_members.role IN ('admin', 'recruiter')
              AND team_members.status = 'active'
        )
    );

-- ============================================================
-- interview_reports
-- ============================================================

-- Admin/Recruiter: read own org reports
CREATE POLICY "ir_staff_select" ON interview_reports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interview_sessions
            JOIN applications ON applications.id = interview_sessions.application_id
            JOIN hiring_posts ON hiring_posts.id = applications.hiring_post_id
            JOIN team_members ON team_members.org_id = hiring_posts.org_id
            WHERE interview_sessions.id = interview_reports.session_id
              AND team_members.user_id = auth.uid()
              AND team_members.role IN ('admin', 'recruiter')
              AND team_members.status = 'active'
        )
    );

-- Anon: read reports via share_token (for shared report links)
CREATE POLICY "ir_anon_share_select" ON interview_reports
    FOR SELECT
    USING (
        interview_reports.share_token IS NOT NULL
        AND (interview_reports.share_expires_at IS NULL OR interview_reports.share_expires_at > now())
    );
