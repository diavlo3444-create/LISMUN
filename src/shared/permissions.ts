import type {
  ApplicationTrack,
  ConferenceApplication,
  DepartmentRecord,
  GenderSection,
  PermissionKey,
  PortalKey,
  UserProfile,
} from './types.ts';

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = [
  'overview.view',
  'analytics.view',
  'analytics.export',
  'reports.generate',
  'applications.view',
  'applications.recommend',
  'applications.review',
  'applications.override',
  'applications.spoof',
  'applications.delete',
  'applications.view_confidential',
  'applications.chairs',
  'applications.delegates',
  'departments.view',
  'departments.manage_registration',
  'departments.manage_records',
  'roles.view',
  'roles.manage',
  'groups.manage',
  'shifts.view',
  'shifts.manage',
  'eb.manage',
  'eb.swaps_approve',
  'eb.incidents_manage',
  'qr.my_pass',
  'qr.view_department',
  'qr.scan',
  'qr.registry_view',
  'qr.manual_correct',
  'qr.reset_all',
  'cms.website_editor',
  'cms.committees',
  'cms.schedule',
  'cms.secretariat',
  'cms.announcements',
  'cms.documents',
  'cms.faq',
  'cms.sponsors',
  'emails.dashboard',
  'emails.send_bulk',
  'emails.templates',
  'inquiries.manage',
  'forms.manage',
  'accounts.view',
  'accounts.manage_admins',
  'accounts.manage_heads',
  'permissions.manage',
  'testing.impersonate_head',
] as const;

export const SUPER_ADMIN_ONLY_KEYS: ReadonlySet<PermissionKey> = new Set<PermissionKey>([
  'accounts.manage_admins',
  'accounts.manage_heads',
  'roles.manage',
  'permissions.manage',
  'testing.impersonate_head',
]);

export interface DepartmentDefinition {
  slug: string;
  name: string;
  description: string;
  isSectioned: boolean;
  hasPublicIntake: boolean;
  hasRolesAndHierarchy: boolean;
  hasGroupsAndShifts: boolean;
  hasScannerAccess: boolean;
  specialModule:
    | 'intake_review'
    | 'hr'
    | 'pr'
    | 'dcc'
    | 'workspace';
}

export const CORE_DEPARTMENTS: readonly DepartmentDefinition[] = [
  {
    slug: 'media_press',
    name: 'Media & Press',
    description: 'Photography, cinematography, editorial journalism, and conference dispatches.',
    isSectioned: true,
    hasPublicIntake: true,
    hasRolesAndHierarchy: true,
    hasGroupsAndShifts: true,
    hasScannerAccess: false,
    specialModule: 'intake_review',
  },
  {
    slug: 'security',
    name: 'Security & Protocol',
    description: 'Venue access control, QR verification, delegate safety, and crisis protocol.',
    isSectioned: true,
    hasPublicIntake: true,
    hasRolesAndHierarchy: true,
    hasGroupsAndShifts: true,
    hasScannerAccess: true,
    specialModule: 'intake_review',
  },
  {
    slug: 'volunteers',
    name: 'Volunteers & Runners',
    description: 'Floor operations, committee runners, hospitality, and registration desks.',
    isSectioned: true,
    hasPublicIntake: true,
    hasRolesAndHierarchy: true,
    hasGroupsAndShifts: true,
    hasScannerAccess: false,
    specialModule: 'intake_review',
  },
  {
    slug: 'hr',
    name: 'Human Resources',
    description: 'Accepted staff onboarding, bulk applicant communications, and public inquiries.',
    isSectioned: false,
    hasPublicIntake: false,
    hasRolesAndHierarchy: false,
    hasGroupsAndShifts: false,
    hasScannerAccess: false,
    specialModule: 'hr',
  },
  {
    slug: 'pr',
    name: 'Public Relations',
    description: 'Institutional sponsorships, partner outreach, and external relations.',
    isSectioned: false,
    hasPublicIntake: false,
    hasRolesAndHierarchy: false,
    hasGroupsAndShifts: false,
    hasScannerAccess: false,
    specialModule: 'pr',
  },
  {
    slug: 'dcc',
    name: 'Delegate & Committee Coordination',
    description: 'Committee rosters, delegate registration windows, and chair coordination.',
    isSectioned: false,
    hasPublicIntake: false,
    hasRolesAndHierarchy: false,
    hasGroupsAndShifts: false,
    hasScannerAccess: false,
    specialModule: 'dcc',
  },
  {
    slug: 'design',
    name: 'Design Studio',
    description: 'Visual identity, print collateral, placards, and exhibition assets.',
    isSectioned: false,
    hasPublicIntake: false,
    hasRolesAndHierarchy: false,
    hasGroupsAndShifts: false,
    hasScannerAccess: false,
    specialModule: 'workspace',
  },
  {
    slug: 'marketing',
    name: 'Marketing & Campaigns',
    description: 'Conference outreach campaigns, release calendar, and publication milestones.',
    isSectioned: false,
    hasPublicIntake: false,
    hasRolesAndHierarchy: false,
    hasGroupsAndShifts: false,
    hasScannerAccess: false,
    specialModule: 'workspace',
  },
  {
    slug: 'logistics',
    name: 'Logistics & Venue',
    description: 'Chamber allocations, AV equipment manifests, and campus flow logistics.',
    isSectioned: false,
    hasPublicIntake: false,
    hasRolesAndHierarchy: false,
    hasGroupsAndShifts: false,
    hasScannerAccess: false,
    specialModule: 'workspace',
  },
  {
    slug: 'it',
    name: 'Information Technology',
    description: 'Technical support, chamber AV hardware, and conference infrastructure tickets.',
    isSectioned: false,
    hasPublicIntake: false,
    hasRolesAndHierarchy: false,
    hasGroupsAndShifts: false,
    hasScannerAccess: false,
    specialModule: 'workspace',
  },
  {
    slug: 'ceremonies',
    name: 'Ceremonies',
    description: 'Opening & closing ceremony run-of-show, keynote speakers, and stage protocol.',
    isSectioned: false,
    hasPublicIntake: false,
    hasRolesAndHierarchy: false,
    hasGroupsAndShifts: false,
    hasScannerAccess: false,
    specialModule: 'workspace',
  },
] as const;

export const INTAKE_TRACK_SLUGS = ['media', 'press', 'volunteers', 'security'] as const;

export function normalizeDepartment(raw: string | null | undefined): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) return '';
  if (s === 'volunteer' || s === 'volunteering' || s === 'volunteers_and_runners') {
    return 'volunteers';
  }
  if (s === 'security_and_protocol' || s === 'security_protocol') {
    return 'security';
  }
  if (s === 'press_media' || s === 'press_and_media' || s === 'media_and_press') {
    return 'media_press';
  }
  if (s === 'media') return 'media';
  if (s === 'press') return 'press';
  if (s === 'human_resources') return 'hr';
  if (s === 'public_relations') return 'pr';
  if (s === 'delegate_and_committee_coordination' || s === 'delegates') return 'dcc';
  if (s === 'information_technology' || s === 'tech') return 'it';
  return s;
}

export function canonicalDepartmentForStorage(raw: string | null | undefined): string {
  const n = normalizeDepartment(raw);
  if (n === 'media' || n === 'press') return 'media_press';
  return n;
}

export function isSectionedDepartment(slug: string | null | undefined): boolean {
  const canon = canonicalDepartmentForStorage(slug);
  return canon === 'media_press' || canon === 'security' || canon === 'volunteers';
}

export function getMediaPressSubScope(user: Pick<UserProfile, 'department_slug' | 'title'>): 'media' | 'press' | 'both' | null {
  const norm = normalizeDepartment(user.department_slug);
  const titleLower = String(user.title ?? '').toLowerCase();
  if (norm === 'media') return 'media';
  if (norm === 'press') return 'press';
  if (norm === 'media_press') {
    if (/\bmedia\b/.test(titleLower) && !/\bpress\b/.test(titleLower)) return 'media';
    if (/\bpress\b/.test(titleLower) && !/\bmedia\b/.test(titleLower)) return 'press';
    return 'both';
  }
  return null;
}

export function getActorGenderScope(user: Pick<UserProfile, 'gender' | 'division' | 'title'>): GenderSection | null {
  if (user.gender === 'male' || user.gender === 'female') return user.gender;
  if (user.division === 'male' || user.division === 'female') return user.division;
  const titleLower = String(user.title ?? '').toLowerCase();
  if (/\b(girls?|female|women)\b/.test(titleLower)) return 'female';
  if (/\b(boys?|male|men)\b/.test(titleLower)) return 'male';
  return null;
}

export function isEbHeadActor(user: Pick<UserProfile, 'role' | 'eb_rank' | 'eb_permissions' | 'title' | 'permissions'>): boolean {
  if (user.role === 'department_head') return true;
  if (user.role !== 'executive_board') return false;
  if (user.eb_rank === 'head' || user.eb_rank === 'co_head') return true;
  if (user.eb_permissions?.manage_department === true) return true;
  if (/\bhead\b/i.test(user.title || '')) return true;
  if (user.permissions?.['applications.view'] === true) return true;
  return false;
}

export const DEPARTMENT_HEAD_DEFAULT_PERMISSIONS: Partial<Record<PermissionKey, boolean>> = {
  'overview.view': true,
  'applications.view': true,
  'applications.recommend': true,
  'departments.view': true,
  'departments.manage_records': true,
  'roles.view': true,
  'groups.manage': true,
  'shifts.view': true,
  'shifts.manage': true,
  'eb.manage': true,
  'eb.swaps_approve': true,
  'eb.incidents_manage': true,
  'qr.my_pass': true,
  'qr.view_department': true,
};

export const ADMIN_DEFAULT_PERMISSIONS: Partial<Record<PermissionKey, boolean>> = {
  'overview.view': true,
  'analytics.view': true,
  'analytics.export': true,
  'reports.generate': true,
  'applications.view': true,
  'applications.recommend': true,
  'applications.review': true,
  'applications.view_confidential': true,
  'applications.chairs': true,
  'applications.delegates': true,
  'departments.view': true,
  'departments.manage_registration': true,
  'departments.manage_records': true,
  'roles.view': true,
  'groups.manage': true,
  'shifts.view': true,
  'shifts.manage': true,
  'eb.manage': true,
  'eb.swaps_approve': true,
  'eb.incidents_manage': true,
  'qr.my_pass': true,
  'qr.view_department': true,
  'qr.scan': true,
  'qr.registry_view': true,
  'qr.manual_correct': true,
  'cms.website_editor': true,
  'cms.committees': true,
  'cms.schedule': true,
  'cms.secretariat': true,
  'cms.announcements': true,
  'cms.documents': true,
  'cms.faq': true,
  'cms.sponsors': true,
  'emails.dashboard': true,
  'emails.send_bulk': true,
  'emails.templates': true,
  'inquiries.manage': true,
  'forms.manage': true,
  'accounts.view': true,
};

export function sanitizePermissionsMap(
  role: UserProfile['role'],
  raw: Record<string, unknown> | null | undefined
): Partial<Record<PermissionKey, boolean>> {
  const result: Partial<Record<PermissionKey, boolean>> = {};
  if (!raw || typeof raw !== 'object') return result;
  const validSet = new Set<string>(ALL_PERMISSION_KEYS);
  for (const [k, v] of Object.entries(raw)) {
    if (!validSet.has(k) || typeof v !== 'boolean') continue;
    const key = k as PermissionKey;
    if (role !== 'super_admin' && SUPER_ADMIN_ONLY_KEYS.has(key)) {
      continue;
    }
    result[key] = v;
  }
  return result;
}

export function isSecurityAccount(
  user: Pick<UserProfile, 'department_slug' | 'department_id' | 'title' | 'is_active'>,
  departments?: DepartmentRecord[]
): boolean {
  if (!user.is_active) return false;
  const slug = normalizeDepartment(user.department_slug);
  if (slug === 'security') return true;
  if (user.department_id && departments) {
    const found = departments.find((d) => d.id === user.department_id);
    if (found && normalizeDepartment(found.slug) === 'security') return true;
  }
  return false;
}

export function isHrActor(
  user: Pick<UserProfile, 'role' | 'department_slug' | 'department_id' | 'is_active'>,
  departments?: DepartmentRecord[]
): boolean {
  if (!user.is_active) return false;
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  const slug = normalizeDepartment(user.department_slug);
  if (slug === 'hr') return true;
  if (user.department_id && departments) {
    const found = departments.find((d) => d.id === user.department_id);
    if (found && normalizeDepartment(found.slug) === 'hr') return true;
  }
  return false;
}

export function isPrActor(
  user: Pick<UserProfile, 'role' | 'department_slug' | 'department_id' | 'is_active'>,
  departments?: DepartmentRecord[]
): boolean {
  if (!user.is_active) return false;
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  const slug = normalizeDepartment(user.department_slug);
  if (slug === 'pr') return true;
  if (user.department_id && departments) {
    const found = departments.find((d) => d.id === user.department_id);
    if (found && normalizeDepartment(found.slug) === 'pr') return true;
  }
  return false;
}

export function isDccActor(
  user: Pick<UserProfile, 'role' | 'department_slug' | 'department_id' | 'eb_permissions' | 'is_active'>,
  departments?: DepartmentRecord[]
): boolean {
  if (!user.is_active) return false;
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  if (user.eb_permissions?.manage_committees) return true;
  const slug = normalizeDepartment(user.department_slug);
  if (slug === 'dcc') return true;
  if (user.department_id && departments) {
    const found = departments.find((d) => d.id === user.department_id);
    if (found && normalizeDepartment(found.slug) === 'dcc') return true;
  }
  return false;
}

export function resolveUserPermissions(
  user: UserProfile,
  departments?: DepartmentRecord[]
): Record<PermissionKey, boolean> {
  const out = {} as Record<PermissionKey, boolean>;
  for (const key of ALL_PERMISSION_KEYS) {
    out[key] = false;
  }
  if (!user.is_active) return out;

  if (user.role === 'super_admin') {
    for (const key of ALL_PERMISSION_KEYS) {
      out[key] = true;
    }
    return out;
  }

  let defaults: Partial<Record<PermissionKey, boolean>> = {};
  if (user.role === 'admin') {
    defaults = ADMIN_DEFAULT_PERMISSIONS;
  } else if (isEbHeadActor(user)) {
    defaults = DEPARTMENT_HEAD_DEFAULT_PERMISSIONS;
  } else if (user.role === 'executive_board') {
    defaults = {
      'overview.view': true,
      'departments.view': true,
      'shifts.view': true,
      'qr.my_pass': true,
    };
  } else if (user.role === 'staff') {
    defaults = {
      'qr.my_pass': true,
      'shifts.view': true,
    };
  }

  for (const key of ALL_PERMISSION_KEYS) {
    if (SUPER_ADMIN_ONLY_KEYS.has(key)) {
      out[key] = false;
      continue;
    }
    const explicit = user.permissions?.[key];
    out[key] = typeof explicit === 'boolean' ? explicit : Boolean(defaults[key]);
  }

  // Hardcoded security & role invariants across WEST + WILLOW
  if (user.role === 'department_head' || user.role === 'executive_board') {
    out['applications.review'] = false;
    out['applications.override'] = false;
    out['applications.spoof'] = false;
    out['applications.delete'] = false;
    out['applications.view_confidential'] = false;
    out['qr.reset_all'] = false;

    const dept = canonicalDepartmentForStorage(user.department_slug);
    const hasIntakeScope = dept === 'media_press' || dept === 'security' || dept === 'volunteers';
    if (!hasIntakeScope) {
      out['applications.view'] = false;
      out['applications.recommend'] = false;
    }
    if (isHrActor(user, departments)) {
      out['emails.dashboard'] = true;
      out['emails.send_bulk'] = true;
      out['inquiries.manage'] = true;
    }
    if (isPrActor(user, departments)) {
      out['cms.sponsors'] = true;
    }
    if (isDccActor(user, departments)) {
      out['cms.committees'] = true;
      out['applications.delegates'] = true;
    }
  }

  if (user.role === 'admin' || isSecurityAccount(user, departments) || user.eb_permissions?.scan_qr) {
    out['qr.scan'] = true;
  }

  return out;
}

export function hasPermission(
  user: UserProfile | null | undefined,
  key: PermissionKey,
  departments?: DepartmentRecord[]
): boolean {
  if (!user || !user.is_active) return false;
  if (user.role === 'super_admin') return true;
  if (SUPER_ADMIN_ONLY_KEYS.has(key)) return false;
  const resolved = resolveUserPermissions(user, departments);
  return resolved[key] === true;
}

export function canAccessPortal(
  user: UserProfile | null | undefined,
  portal: PortalKey,
  departments?: DepartmentRecord[]
): boolean {
  if (!user || !user.is_active) return false;
  if (user.role === 'super_admin') return true;
  if (portal === 'super_admin') return false;
  if (portal === 'admin') return user.role === 'admin';
  if (portal === 'security') {
    if (user.role === 'admin') return false; // Admins use /admin -> Security instead of /security-login
    return isSecurityAccount(user, departments) || Boolean(user.eb_permissions?.scan_qr);
  }
  if (portal === 'head') {
    return user.role === 'department_head' || user.role === 'executive_board';
  }
  if (portal === 'eb') {
    return (
      user.role === 'executive_board' ||
      user.role === 'department_head' ||
      user.role === 'admin'
    );
  }
  if (portal === 'staff') {
    return user.role === 'staff';
  }
  return false;
}

export function canHeadAccessApplication(
  actor: Pick<UserProfile, 'role' | 'department_slug' | 'gender' | 'division' | 'title' | 'is_active' | 'eb_rank' | 'eb_permissions' | 'permissions'>,
  app: Pick<ConferenceApplication, 'application_type' | 'department_slug' | 'gender' | 'status'>
): { scopeMatch: boolean; editable: boolean } {
  if (!actor.is_active) return { scopeMatch: false, editable: false };
  if (actor.role === 'super_admin' || actor.role === 'admin') {
    return { scopeMatch: true, editable: true };
  }
  if (!isEbHeadActor(actor)) {
    return { scopeMatch: false, editable: false };
  }

  const appTrack = normalizeDepartment(app.application_type || app.department_slug);
  if (!['media', 'press', 'volunteers', 'security'].includes(appTrack)) {
    return { scopeMatch: false, editable: false };
  }

  const actorDept = canonicalDepartmentForStorage(actor.department_slug);
  if (appTrack === 'media' || appTrack === 'press') {
    if (actorDept !== 'media_press') return { scopeMatch: false, editable: false };
    const subScope = getMediaPressSubScope(actor);
    if (subScope !== 'both' && subScope !== appTrack) {
      return { scopeMatch: false, editable: false };
    }
  } else if (actorDept !== appTrack) {
    return { scopeMatch: false, editable: false };
  }

  const actorGender = getActorGenderScope(actor);
  if (!actorGender || !app.gender || actorGender !== app.gender) {
    return { scopeMatch: false, editable: false };
  }

  const isPending = app.status === 'pending' || app.status === 'received';
  return { scopeMatch: true, editable: isPending };
}

export function redactApplicationForHead(app: ConferenceApplication): ConferenceApplication {
  const {
    medical_has_conditions: _medFlag,
    medical_details: _medDetails,
    ...rest
  } = app;
  return {
    ...rest,
    decision_by: null,
    decision_by_name: null,
    decision_at: null,
    admin_decision_notes: null,
    review_notes: null,
  };
}

export function canViewDepartmentQr(
  user: UserProfile | null | undefined,
  departments?: DepartmentRecord[]
): boolean {
  if (!user || !user.is_active) return false;
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  if (user.role === 'department_head' || user.role === 'executive_board') {
    const dept = canonicalDepartmentForStorage(user.department_slug);
    return dept === 'volunteers' || dept === 'media_press' || dept === 'security';
  }
  return isSecurityAccount(user, departments);
}

export function isSimplifiedQrStaffDepartment(slug: string | null | undefined): boolean {
  const n = normalizeDepartment(slug);
  return n === 'volunteers' || n === 'media' || n === 'press' || n === 'media_press';
}

export function cleanDecisionMakerName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/\s*\(attributed by Super Admin:[^)]*\)\s*/gi, '')
    .replace(/\s*\[spoofed[^\]]*\]\s*/gi, '')
    .trim();
}

export function formatDecisionByLabel(
  status: ConferenceApplication['status'],
  decisionByName: string | null | undefined
): string {
  const clean = cleanDecisionMakerName(decisionByName);
  if (!clean) return status.replace(/_/g, ' ');
  const verb =
    status === 'accepted'
      ? 'Accepted'
      : status === 'rejected'
      ? 'Rejected'
      : status === 'waitlisted'
      ? 'Waitlisted'
      : status;
  return `${verb} by ${clean}`;
}

export function validateSpoofRequest(input: {
  targetStatus: ConferenceApplication['status'];
  attributedAdminId: string | null | undefined;
}): { valid: boolean; error?: string } {
  if (!['accepted', 'rejected', 'waitlisted', 'pending'].includes(input.targetStatus)) {
    return { valid: false, error: 'Unsupported target decision status.' };
  }
  if (input.targetStatus !== 'pending' && !String(input.attributedAdminId ?? '').trim()) {
    return {
      valid: false,
      error: 'Select an active Admin account to attribute this decision to.',
    };
  }
  return { valid: true };
}

export function detectShiftOverlap(
  existing: Array<{ id?: string; starts_at: string; ends_at: string; title?: string }>,
  candidate: { id?: string; starts_at: string; ends_at: string }
): { id?: string; title?: string } | null {
  const bStart = Date.parse(candidate.starts_at);
  const bEnd = Date.parse(candidate.ends_at);
  if (!Number.isFinite(bStart) || !Number.isFinite(bEnd) || bEnd <= bStart) {
    return null;
  }
  for (const s of existing) {
    if (candidate.id && s.id === candidate.id) continue;
    const aStart = Date.parse(s.starts_at);
    const aEnd = Date.parse(s.ends_at);
    if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) continue;
    if (aStart < bEnd && bStart < aEnd) {
      return { id: s.id, title: s.title };
    }
  }
  return null;
}

export function sanitizeEmailError(raw: unknown): string {
  const msg = String(raw ?? 'Email delivery failed');
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(https?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, '$1[REDACTED]@')
    .replace(/\b(api_key|apikey|password|secret|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\s+at\s+[^\n]+(\n|$)/g, ' ')
    .trim()
    .slice(0, 320);
}

export function applySignupLinkToBody(body: string, signupUrl: string): string {
  if (!signupUrl) return body;
  if (/\{\{\s*(signup_link|signupUrl|invite_link)\s*\}\}/i.test(body)) {
    return body.replace(/\{\{\s*(signup_link|signupUrl|invite_link)\s*\}\}/gi, signupUrl);
  }
  if (/https?:\/\/[^\s]*\/(?:team-signup\?token=|signup#token=)[a-f0-9]+/i.test(body)) {
    return body.replace(
      /https?:\/\/[^\s]*\/(?:team-signup\?token=|signup#token=)[a-f0-9]+/gi,
      signupUrl
    );
  }
  return `${body.trim()}\n\nComplete your staff account setup:\n${signupUrl}\n`;
}

export function hasSignupLinkInBody(body: string): boolean {
  return /\/(?:team-signup\?token=|signup#token=)[a-f0-9]{32,}/i.test(body);
}

export function resolveEmailTemplate(
  template: { subject: string; body_text: string },
  vars: Record<string, string | null | undefined>
): { subject: string; bodyText: string } {
  const replaceAll = (text: string) =>
    text.replace(/\{([a-zA-Z0-9_]+)\}|\{\{([a-zA-Z0-9_]+)\}\}/g, (_m, k1, k2) => {
      const key = String(k1 || k2);
      return String(vars[key] ?? '');
    });
  return {
    subject: replaceAll(template.subject),
    bodyText: replaceAll(template.body_text),
  };
}
