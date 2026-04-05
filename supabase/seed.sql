-- seed.sql
-- Development seed data for int.ai
--
-- HOW TO CREATE A TEST ADMIN USER:
-- 1. Start the local Supabase instance: npx supabase start
-- 2. Open Supabase Studio at http://localhost:54323
-- 3. Go to Authentication > Users > Add User
-- 4. Create a user with email: admin@acme-corp.test / password: testpassword123
-- 5. Copy the user's UUID and update the INSERT INTO team_members below
-- 6. Re-run this seed: npx supabase db reset
--
-- Alternatively, use the Supabase Auth API:
--   curl -X POST http://localhost:54321/auth/v1/signup \
--     -H "apikey: <anon-key>" -H "Content-Type: application/json" \
--     -d '{"email":"admin@acme-corp.test","password":"testpassword123"}'

-- ============================================================
-- Test organization
-- ============================================================
INSERT INTO organizations (id, name, slug, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Acme Corp',
    'acme-corp',
    '{"plan": "pro", "max_posts": 50}'
);

-- ============================================================
-- Interview template presets
-- ============================================================

-- Backend Engineer
INSERT INTO interview_templates (id, org_id, name, max_questions, max_duration_minutes, foundational_ratio, scoring_weights, must_ask_topics, is_preset, preset_role)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Backend Engineer',
    10,
    45,
    0.6,
    '{"technical": 0.35, "depth": 0.25, "communication": 0.15, "relevance": 0.25}',
    ARRAY['system design', 'databases', 'API design', 'concurrency'],
    true,
    'backend_engineer'
);

-- Data Scientist
INSERT INTO interview_templates (id, org_id, name, max_questions, max_duration_minutes, foundational_ratio, scoring_weights, must_ask_topics, is_preset, preset_role)
VALUES (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'Data Scientist',
    10,
    45,
    0.5,
    '{"technical": 0.30, "depth": 0.30, "communication": 0.15, "relevance": 0.25}',
    ARRAY['statistics', 'machine learning', 'data pipelines', 'experiment design'],
    true,
    'data_scientist'
);

-- Product Manager
INSERT INTO interview_templates (id, org_id, name, max_questions, max_duration_minutes, foundational_ratio, scoring_weights, must_ask_topics, is_preset, preset_role)
VALUES (
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    'Product Manager',
    8,
    40,
    0.5,
    '{"technical": 0.15, "depth": 0.25, "communication": 0.30, "relevance": 0.30}',
    ARRAY['product strategy', 'user research', 'metrics', 'stakeholder management'],
    true,
    'product_manager'
);
