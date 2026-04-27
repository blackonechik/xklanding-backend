CREATE TABLE IF NOT EXISTS "whitelist_entries" (
  "nickname" VARCHAR(16) PRIMARY KEY,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "purchase_id" BIGINT,
  "source" VARCHAR(32)
);
