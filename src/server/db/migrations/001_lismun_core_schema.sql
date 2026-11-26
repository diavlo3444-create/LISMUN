-- LIS MUN Synthesized Conference Management Infrastructure Schema
-- Neon PostgreSQL authoritative DDL unifying WEST MUN & WILLOW MUN

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_sectioned BOOLEAN NOT NULL DEFAULT false,
  has_public_intake BOOLEAN NOT NULL DEFAULT false,
  registration_open BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Users & Server-Verified Sessions
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  banned_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'department_head', 'executive_board', 'staff')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  department_slug TEXT,
  title TEXT NOT NULL DEFAULT '',
  division TEXT CHECK (division IN ('male', 'female') OR division IS NULL),
  gender TEXT CHECK (gender IN ('male', 'female') OR gender IS NULL),
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  eb_rank TEXT CHECK (eb_rank IN ('head', 'co_head', 'member', 'designer', 'marketing') OR eb_rank IS NULL),
  eb_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  reporting_head_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_active_section_head
  ON profiles (department_slug, COALESCE(gender, division))
  WHERE role = 'department_head'
    AND is_active = true
    AND department_slug IN ('media_press', 'security', 'volunteers')
    AND COALESCE(gender, division) IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  portal TEXT NOT NULL DEFAULT 'portal',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_setup_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('head_setup', 'password_reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Public Applications & Confidential Medical Isolation
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_code TEXT UNIQUE NOT NULL,
  application_type TEXT NOT NULL CHECK (application_type IN ('media', 'press', 'volunteers', 'security', 'delegate', 'chair')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  department_slug TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  emergency_phone TEXT,
  gender TEXT CHECK (gender IN ('male', 'female') OR gender IS NULL),
  institution TEXT,
  grade_or_year TEXT,
  birth_date DATE,
  age INT,
  position TEXT,
  delegation_type TEXT CHECK (delegation_type IN ('single_delegate', 'school_delegation') OR delegation_type IS NULL),
  delegation_size INT,
  tier TEXT CHECK (tier IN ('early_bird', 'regular') OR tier IS NULL),
  fee_amount NUMERIC(10, 2),
  payment_status TEXT CHECK (payment_status IN ('unpaid', 'paid', 'waived') OR payment_status IS NULL) DEFAULT 'unpaid',
  experience TEXT,
  statement TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'under_review', 'accepted', 'waitlisted', 'rejected', 'withdrawn')),
  head_recommendation TEXT CHECK (head_recommendation IN ('recommend_accept', 'recommend_reject') OR head_recommendation IS NULL),
  head_notes TEXT,
  recommended_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recommended_by_name TEXT,
  recommended_at TIMESTAMPTZ,
  decision_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_by_name TEXT,
  decision_at TIMESTAMPTZ,
  admin_decision_notes TEXT,
  review_notes TEXT,
  privacy_policy_accepted BOOLEAN NOT NULL DEFAULT false,
  terms_accepted BOOLEAN NOT NULL DEFAULT false,
  legal_consent_version TEXT NOT NULL DEFAULT '2026-11-22',
  consent_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_pending_track_email
  ON applications (lower(application_type), lower(email))
  WHERE status IN ('pending', 'received', 'under_review');

CREATE TABLE IF NOT EXISTS application_medical (
  application_id UUID PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  medical_has_conditions BOOLEAN NOT NULL DEFAULT false,
  medical_details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staffing_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  role_title TEXT,
  head_decision TEXT,
  head_notes TEXT,
  head_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  head_submitted_at TIMESTAMPTZ,
  admin_decision TEXT,
  admin_notes TEXT,
  admin_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_decision_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  is_spoof BOOLEAN NOT NULL DEFAULT false,
  previous_decision_by UUID REFERENCES users(id) ON DELETE SET NULL,
  previous_decision_by_name TEXT,
  spoofed_decision_by UUID REFERENCES users(id) ON DELETE SET NULL,
  spoofed_decision_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key TEXT UNIQUE NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'application-files',
  application_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'General Inquiry',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'resolved', 'archived')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Invites & Account Onboarding
CREATE TABLE IF NOT EXISTS hr_signup_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID UNIQUE NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  department_slug TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  token_hash TEXT UNIQUE NOT NULL,
  token_value TEXT,
  issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31T23:59:59.999Z',
  claim_id UUID,
  claim_started_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_signup_invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID NOT NULL REFERENCES hr_signup_invites(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  token_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  eb_role TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  claim_id UUID,
  redeemed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_signup_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31T23:59:59.999Z',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_signup_allowlist (
  member_key TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  full_name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  eb_rank TEXT NOT NULL DEFAULT 'member',
  eb_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  gender TEXT CHECK (gender IN ('male', 'female') OR gender IS NULL),
  invite_token_hash TEXT,
  claim_started_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Department Workspaces, Org Chart, Custom Groups & Modern Shifts
CREATE TABLE IF NOT EXISTS department_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  category TEXT NOT NULL DEFAULT 'task',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS department_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  title TEXT NOT NULL,
  parent_position_id UUID REFERENCES department_positions(id) ON DELETE SET NULL,
  member_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  member_application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  member_name TEXT,
  member_email TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS department_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  position_id UUID REFERENCES department_positions(id) ON DELETE SET NULL,
  assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assignee_application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  assignee_name TEXT,
  assignee_email TEXT,
  supervisor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  supervisor_name TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  location TEXT,
  deadline TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS department_task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES department_tasks(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES team_groups(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  member_application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  member_name TEXT NOT NULL,
  member_email TEXT NOT NULL,
  role_label TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_email)
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INT NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'open', 'published', 'completed', 'closed')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  role_type TEXT NOT NULL DEFAULT 'member',
  responsibility TEXT,
  station TEXT,
  notes TEXT,
  is_supervisor BOOLEAN NOT NULL DEFAULT false,
  assignee_name TEXT NOT NULL,
  assignee_email TEXT NOT NULL,
  attendance_status TEXT NOT NULL DEFAULT 'assigned' CHECK (attendance_status IN ('assigned', 'confirmed', 'completed', 'no_show', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Executive Board (EB) Operations (strictly separate from shifts/tasks)
CREATE TABLE IF NOT EXISTS eb_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  sop_manual TEXT NOT NULL DEFAULT '',
  required_equipment TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  opening_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  closing_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  station_id UUID REFERENCES eb_stations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT true,
  break_schedule TEXT,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eb_shift_id UUID NOT NULL REFERENCES eb_shifts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_name TEXT NOT NULL,
  role_label TEXT NOT NULL DEFAULT 'co_head',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (eb_shift_id, user_id)
);

CREATE TABLE IF NOT EXISTS eb_shift_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eb_shift_id UUID NOT NULL REFERENCES eb_shifts(id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_name TEXT NOT NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_name TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'blocked', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  due_at TIMESTAMPTZ,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  completion_note TEXT,
  blocker_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES eb_tasks(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL DEFAULT 'all',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal', 'important', 'critical')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eb_announcement_acks (
  announcement_id UUID NOT NULL REFERENCES eb_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS eb_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_by_name TEXT NOT NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. QR Passes, Atomic Check-In/Check-Out, Corrections & Resets
CREATE TABLE IF NOT EXISTS qr_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_type TEXT NOT NULL CHECK (holder_type IN ('staff', 'eb_member', 'applicant')),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role_label TEXT NOT NULL DEFAULT 'staff',
  department_slug TEXT NOT NULL,
  section TEXT CHECK (section IN ('male', 'female') OR section IS NULL),
  phone TEXT,
  reporting_head_id UUID REFERENCES users(id) ON DELETE SET NULL,
  pass_code TEXT UNIQUE NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  token_value TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  inside BOOLEAN NOT NULL DEFAULT false,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_in_gate TEXT,
  checked_out_at TIMESTAMPTZ,
  checked_out_by UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_out_gate TEXT,
  scan_count INT NOT NULL DEFAULT 0,
  checkout_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_passes_unique_user ON qr_passes (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_passes_unique_application ON qr_passes (application_id) WHERE application_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_passes_phone_digits_unique
  ON qr_passes (regexp_replace(phone, '\D', '', 'g'))
  WHERE phone IS NOT NULL AND length(regexp_replace(phone, '\D', '', 'g')) >= 7;

CREATE TABLE IF NOT EXISTS qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id UUID REFERENCES qr_passes(id) ON DELETE SET NULL,
  pass_code TEXT,
  pass_holder_name TEXT,
  department_slug TEXT,
  section TEXT,
  scanned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  scanned_by_name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('checkin', 'checkout')),
  scan_outcome TEXT NOT NULL CHECK (
    scan_outcome IN (
      'valid_checkin',
      'valid_checkout',
      'already_checked_in',
      'not_checked_in',
      'checkout_warning',
      'duplicate_recent',
      'invalid_token',
      'revoked_pass',
      'denied'
    )
  ),
  gate TEXT,
  reason TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_correction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id UUID NOT NULL REFERENCES qr_passes(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_attendance_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  passes_reset INT NOT NULL DEFAULT 0,
  scans_cleared INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  attendee_type TEXT NOT NULL,
  attendee_id UUID,
  attendee_name TEXT NOT NULL,
  attendee_email TEXT NOT NULL,
  committee_or_team TEXT,
  institution TEXT,
  station TEXT,
  scanned_by_email TEXT,
  scanned_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'checked_in',
  notes TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Email Templates, Deliveries, Manual Confirmations & Gmail OAuth2
CREATE TABLE IF NOT EXISTS email_templates (
  template_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  applicant_type TEXT NOT NULL DEFAULT 'team',
  source_applicant_id UUID,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  department_slug TEXT,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  delivery_method TEXT NOT NULL DEFAULT 'resend' CHECK (delivery_method IN ('resend', 'gmail_oauth', 'manual_gmail')),
  provider_message_id TEXT,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 1,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_deliveries_dedupe_bulk
  ON email_deliveries (applicant_type, source_applicant_id, template_key)
  WHERE source_applicant_id IS NOT NULL
    AND status IN ('queued', 'sent');

CREATE TABLE IF NOT EXISTS email_manual_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  decision_status TEXT NOT NULL,
  server_delivery_id UUID REFERENCES email_deliveries(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  department_slug TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by_name TEXT NOT NULL,
  confirmed_by_email TEXT NOT NULL,
  UNIQUE (application_id, decision_status)
);

CREATE TABLE IF NOT EXISTS gmail_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce_hash TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gmail_oauth_credentials (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton = true),
  connected_email TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Website CMS, Registration Windows, Forms, Notifications & Security Audits
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS committees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chamber TEXT NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'Intermediate',
  description TEXT NOT NULL DEFAULT '',
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  chair_name TEXT NOT NULL DEFAULT 'TBA',
  vice_chair_name TEXT NOT NULL DEFAULT 'TBA',
  capacity INT NOT NULL DEFAULT 30,
  published BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date_label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS schedule_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id UUID NOT NULL REFERENCES schedule_days(id) ON DELETE CASCADE,
  time_range TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS secretariat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  division TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Guide',
  file_url TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  published BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'Partner',
  website_url TEXT,
  logo_url TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS custom_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  department_slug TEXT,
  is_open BOOLEAN NOT NULL DEFAULT true,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_violation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  expected_portal TEXT NOT NULL,
  actual_role TEXT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_mode_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  department_slug TEXT NOT NULL,
  section TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket_time
  ON rate_limit_events (bucket, created_at DESC);
