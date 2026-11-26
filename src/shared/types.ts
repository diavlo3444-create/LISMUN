export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'department_head'
  | 'executive_board'
  | 'staff';

export type EbRank = 'head' | 'co_head' | 'member' | 'designer' | 'marketing';

export type GenderSection = 'male' | 'female';

export type DepartmentSlug =
  | 'media_press'
  | 'media'
  | 'press'
  | 'security'
  | 'volunteers'
  | 'hr'
  | 'pr'
  | 'dcc'
  | 'design'
  | 'marketing'
  | 'logistics'
  | 'it'
  | 'ceremonies';

export type PortalKey =
  | 'super_admin'
  | 'admin'
  | 'head'
  | 'eb'
  | 'security'
  | 'staff';

export type PermissionKey =
  // Overview & Reports (4)
  | 'overview.view'
  | 'analytics.view'
  | 'analytics.export'
  | 'reports.generate'
  // Applications & Review (9)
  | 'applications.view'
  | 'applications.recommend'
  | 'applications.review'
  | 'applications.override'
  | 'applications.spoof'
  | 'applications.delete'
  | 'applications.view_confidential'
  | 'applications.chairs'
  | 'applications.delegates'
  // Operations, Departments & Shifts (11)
  | 'departments.view'
  | 'departments.manage_registration'
  | 'departments.manage_records'
  | 'roles.view'
  | 'roles.manage'
  | 'groups.manage'
  | 'shifts.view'
  | 'shifts.manage'
  | 'eb.manage'
  | 'eb.swaps_approve'
  | 'eb.incidents_manage'
  // QR Pass & Attendance (6)
  | 'qr.my_pass'
  | 'qr.view_department'
  | 'qr.scan'
  | 'qr.registry_view'
  | 'qr.manual_correct'
  | 'qr.reset_all'
  // Content & CMS (8)
  | 'cms.website_editor'
  | 'cms.committees'
  | 'cms.schedule'
  | 'cms.secretariat'
  | 'cms.announcements'
  | 'cms.documents'
  | 'cms.faq'
  | 'cms.sponsors'
  // Communications & Forms (5)
  | 'emails.dashboard'
  | 'emails.send_bulk'
  | 'emails.templates'
  | 'inquiries.manage'
  | 'forms.manage'
  // Accounts, Permissions & Governance (4)
  | 'accounts.view'
  | 'accounts.manage_admins'
  | 'accounts.manage_heads'
  | 'permissions.manage'
  | 'testing.impersonate_head';

export interface EbPermissionsFlags {
  manage_department?: boolean;
  manage_committees?: boolean;
  scan_qr?: boolean;
}

export interface DepartmentRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_sectioned: boolean;
  has_public_intake: boolean;
  registration_open: boolean;
  updated_at: string;
}

export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: string | null;
  department_slug: string | null;
  department_name?: string | null;
  title: string;
  division: GenderSection | null;
  gender: GenderSection | null;
  phone: string | null;
  is_active: boolean;
  eb_rank: EbRank | null;
  eb_permissions: EbPermissionsFlags;
  permissions: Partial<Record<PermissionKey, boolean>>;
  reporting_head_id: string | null;
  is_primary_super_admin?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TestSessionContext {
  active: boolean;
  sessionId: string;
  targetUserId?: string | null;
  departmentSlug: string;
  section: GenderSection | null;
  impersonatedName: string;
  actorEmail: string;
  expiresAt: string;
}

export type ApplicationTrack =
  | 'media'
  | 'press'
  | 'volunteers'
  | 'security'
  | 'delegate'
  | 'chair';

export type ApplicationStatus =
  | 'pending'
  | 'received'
  | 'under_review'
  | 'accepted'
  | 'waitlisted'
  | 'rejected'
  | 'withdrawn';

export type HeadRecommendation = 'recommend_accept' | 'recommend_reject' | null;

export interface ApplicationAttachmentRef {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
  uploaded_at: string;
}

export interface ConferenceApplication {
  id: string;
  application_code: string;
  application_type: ApplicationTrack;
  department_id: string | null;
  department_slug: string;
  applicant_name: string;
  email: string;
  phone: string | null;
  emergency_phone: string | null;
  gender: GenderSection | null;
  institution: string | null;
  grade_or_year: string | null;
  birth_date?: string | null;
  age: number | null;
  position: string | null;
  delegation_type: 'single_delegate' | 'school_delegation' | null;
  delegation_size: number | null;
  tier: 'early_bird' | 'regular' | null;
  fee_amount: number | null;
  payment_status: 'unpaid' | 'paid' | 'waived' | null;
  experience: string | null;
  statement: string | null;
  answers: Record<string, unknown>;
  attachments: ApplicationAttachmentRef[];
  status: ApplicationStatus;
  head_recommendation: HeadRecommendation;
  head_notes: string | null;
  recommended_by: string | null;
  recommended_by_name: string | null;
  recommended_at: string | null;
  decision_by: string | null;
  decision_by_name: string | null;
  decision_at: string | null;
  admin_decision_notes: string | null;
  review_notes: string | null;
  privacy_policy_accepted: boolean;
  terms_accepted: boolean;
  legal_consent_version: string;
  consent_accepted_at: string;
  // Isolated confidential medical fields (stripped unless authorized)
  medical_has_conditions?: boolean | null;
  medical_details?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DecisionOverrideAudit {
  id: string;
  application_id: string;
  application_code?: string;
  applicant_name?: string;
  previous_status: ApplicationStatus;
  new_status: ApplicationStatus;
  reason: string;
  actor_user_id: string;
  actor_name: string;
  is_spoof: boolean;
  previous_decision_by: string | null;
  previous_decision_by_name: string | null;
  spoofed_decision_by: string | null;
  spoofed_decision_by_name: string | null;
  created_at: string;
}

export interface QrPassRecord {
  id: string;
  holder_type: 'staff' | 'eb_member' | 'applicant';
  user_id: string | null;
  application_id: string | null;
  full_name: string;
  email: string;
  role_label: string;
  department_slug: string;
  section: GenderSection | null;
  pass_code: string;
  token_value?: string;
  active: boolean;
  inside: boolean;
  checked_in_at: string | null;
  checked_in_by: string | null;
  checked_in_gate: string | null;
  checked_out_at: string | null;
  checked_out_by: string | null;
  checked_out_gate: string | null;
  scan_count: number;
  checkout_count: number;
  updated_at: string;
}

export interface QrScanLog {
  id: string;
  pass_id: string | null;
  pass_code: string | null;
  pass_holder_name: string | null;
  department_slug: string | null;
  section: GenderSection | null;
  scanned_by: string | null;
  scanned_by_name: string | null;
  direction: 'checkin' | 'checkout';
  scan_outcome:
    | 'valid_checkin'
    | 'valid_checkout'
    | 'already_checked_in'
    | 'not_checked_in'
    | 'checkout_warning'
    | 'duplicate_recent'
    | 'invalid_token'
    | 'revoked_pass'
    | 'denied';
  gate: string | null;
  reason: string | null;
  scanned_at: string;
}

export interface EmailTemplateRecord {
  template_key: string;
  name: string;
  subject: string;
  body_text: string;
  updated_at: string;
}

export interface EmailDeliveryRecord {
  id: string;
  application_id: string | null;
  applicant_type: string;
  recipient_email: string;
  recipient_name: string;
  department_slug: string | null;
  template_key: string;
  subject: string;
  body_text: string;
  status: 'queued' | 'sent' | 'failed';
  delivery_method: 'resend' | 'gmail_oauth' | 'manual_gmail';
  provider_message_id: string | null;
  error_message: string | null;
  attempt_count: number;
  sent_by: string | null;
  sent_by_name: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface FailedEmailItem {
  key: string;
  deliveryId: string | null;
  applicationId: string | null;
  applicantType: string;
  recipientName: string;
  recipientEmail: string;
  departmentSlug: string | null;
  emailType: string;
  subject: string;
  bodyText: string;
  errorMessage: string;
  attemptCount: number;
  failedAt: string;
  gmailOpenedAt?: string | null;
}

export interface SystemStatusResponse {
  ok: boolean;
  dbConfigured: boolean;
  dbConnected: boolean;
  primarySuperAdminEmailConfigured: boolean;
  firstRunSetupNeeded: boolean;
  resendConfigured: boolean;
  gmailOAuthConfigured: boolean;
  gmailConnected: boolean;
  gmailConnectedAt: string | null;
  legalConsentVersion: string;
}
