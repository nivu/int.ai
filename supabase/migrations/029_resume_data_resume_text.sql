-- resume_data.raw_markdown holds the LLM-reformatted resume (used as interview
-- context), but scoring quotes evidence from the original extracted text, so
-- the score breakdown could not find and highlight many quotes. Keep the
-- original text alongside it. Filled by screening and by rescoring.

ALTER TABLE resume_data ADD COLUMN IF NOT EXISTS resume_text text;
