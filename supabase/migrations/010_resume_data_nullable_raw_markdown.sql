-- screen_resume_task inserts a placeholder resume_data row with only
-- application_id before the PDF is parsed, then updates raw_markdown once
-- parsing completes. The NOT NULL constraint on raw_markdown blocks that
-- placeholder insert, crashing every screening run.

ALTER TABLE resume_data ALTER COLUMN raw_markdown DROP NOT NULL;
