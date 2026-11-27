CREATE TABLE IF NOT EXISTS account_setup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_setup_codes_user_created
  ON account_setup_codes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_setup_codes_expiry
  ON account_setup_codes (expires_at);
