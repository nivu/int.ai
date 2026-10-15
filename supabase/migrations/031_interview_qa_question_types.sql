-- The question generator (backend/app/interview/question_gen.py) has emitted
-- 'custom' (recruiter-defined questions) and 'resume_project' (resume-anchored
-- project questions) since 2026-07-07, but this check still allowed only
-- 'foundational' and 'project'. Every answer to those questions was rejected
-- on insert; the agent logs and continues, so interviews finished with their
-- early answers missing (found 2026-10-15). Interviews with no saved answers
-- could not be evaluated at all.

ALTER TABLE interview_qa
    DROP CONSTRAINT IF EXISTS interview_qa_question_type_check;

ALTER TABLE interview_qa
    ADD CONSTRAINT interview_qa_question_type_check
    CHECK (question_type IN ('foundational', 'project', 'custom', 'resume_project'));
