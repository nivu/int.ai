-- 002_enable_pgvector.sql
-- HNSW index for resume embedding similarity search
-- (vector extension already enabled in 001)

CREATE INDEX idx_resume_data_embedding ON resume_data USING hnsw (embedding extensions.vector_cosine_ops);
