-- better-auth rate-limit store (rateLimit.storage = 'database'), so sign-in
-- limits hold across isolates. One row per client IP + auth path. Additive.

CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id"          TEXT PRIMARY KEY,
  "key"         TEXT NOT NULL UNIQUE,
  "count"       INTEGER NOT NULL,
  "lastRequest" INTEGER NOT NULL
);
