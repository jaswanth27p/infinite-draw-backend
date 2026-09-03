CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "User_search_trgm_idx" ON "User"
  USING gin ((email || ' ' || coalesce(name, '')) gin_trgm_ops);
