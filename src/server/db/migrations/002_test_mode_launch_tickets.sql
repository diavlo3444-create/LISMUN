-- Durable one-time tickets for Super Admin Sign In As previews.
CREATE TABLE IF NOT EXISTS test_mode_launch_tickets (
  ticket_id TEXT PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  target_user_id UUID,
  department_slug TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_mode_launch_tickets_expiry
  ON test_mode_launch_tickets (expires_at);

CREATE INDEX IF NOT EXISTS idx_test_mode_launch_tickets_actor_created
  ON test_mode_launch_tickets (actor_user_id, created_at DESC);
