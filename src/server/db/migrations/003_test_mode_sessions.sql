-- Durable Sign In As preview sessions & launch ticket hashes so tokens survive serverless cold starts.
ALTER TABLE test_mode_launch_tickets
  ADD COLUMN IF NOT EXISTS ticket_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_test_mode_launch_tickets_hash
  ON test_mode_launch_tickets (ticket_hash)
  WHERE ticket_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS test_mode_sessions (
  session_id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  actor_user_id UUID NOT NULL,
  actor_email TEXT NOT NULL,
  target_user_id UUID,
  department_slug TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_mode_sessions_actor_created
  ON test_mode_sessions (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_mode_sessions_expires
  ON test_mode_sessions (expires_at);
