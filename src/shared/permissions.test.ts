import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PERMISSION_KEYS,
  SUPER_ADMIN_ONLY_KEYS,
  canAccessPortal,
  canHeadAccessApplication,
  cleanDecisionMakerName,
  detectShiftOverlap,
  applySignupLinkToBody,
  redactApplicationForHead,
  resolveEmailTemplate,
  resolveUserPermissions,
  sanitizeEmailError,
  sanitizePermissionsMap,
  validateSpoofRequest,
} from './permissions.ts';
import {
  MEDIA_QUESTIONS,
  PRESS_QUESTIONS,
  SECURITY_QUESTIONS,
  VOLUNTEER_QUESTIONS,
  formatApplicationAnswersForReview,
  validateChairIntakePayload,
  validateTeamIntakePayload,
  wordCount,
} from './intake.ts';
import {
  buildGmailComposeUrl,
  mergeAndDeduplicateFailedEmails,
} from '../client/failedEmailHelpers.ts';
import type { ConferenceApplication, EmailDeliveryRecord, FailedEmailItem, UserProfile } from './types.ts';

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'u-1',
    email: 'user@lismun.org',
    full_name: 'Test User',
    role: 'staff',
    department_id: null,
    department_slug: 'volunteers',
    title: 'Staff',
    division: 'male',
    gender: 'male',
    phone: null,
    is_active: true,
    eb_rank: null,
    eb_permissions: {},
    permissions: {},
    reporting_head_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeApplication(overrides: Partial<ConferenceApplication> = {}): ConferenceApplication {
  return {
    id: 'app-1',
    application_code: 'LM-100001-AA',
    application_type: 'security',
    department_id: null,
    department_slug: 'security',
    applicant_name: 'Applicant One',
    email: 'applicant@example.com',
    phone: '+966501112222',
    emergency_phone: '+966509998888',
    gender: 'male',
    institution: 'LIS',
    grade_or_year: 'Grade 11',
    age: 17,
    position: null,
    delegation_type: null,
    delegation_size: null,
    tier: null,
    fee_amount: null,
    payment_status: null,
    experience: 'Previous MUN experience',
    statement: 'Statement text',
    answers: {},
    attachments: [],
    status: 'pending',
    head_recommendation: null,
    head_notes: null,
    recommended_by: null,
    recommended_by_name: null,
    recommended_at: null,
    decision_by: 'admin-1',
    decision_by_name: 'Admin Reviewer',
    decision_at: '2026-01-02T00:00:00Z',
    admin_decision_notes: 'Internal admin notes',
    review_notes: 'Confidential review notes',
    medical_has_conditions: true,
    medical_details: 'Peanut allergy',
    privacy_policy_accepted: true,
    terms_accepted: true,
    legal_consent_version: '2026-11-22',
    consent_accepted_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

test('RBAC: 48 permission keys and 5 super-admin-only keys stripped for non-super-admins', () => {
  assert.ok(ALL_PERMISSION_KEYS.length >= 47);
  assert.equal(SUPER_ADMIN_ONLY_KEYS.size, 5);

  const sanitized = sanitizePermissionsMap('admin', {
    'applications.review': true,
    'accounts.manage_admins': true,
    'accounts.manage_heads': true,
    'roles.manage': true,
    'permissions.manage': true,
    'testing.impersonate_head': true,
  });

  assert.equal(sanitized['applications.review'], true);
  for (const key of SUPER_ADMIN_ONLY_KEYS) {
    assert.equal(sanitized[key], undefined);
  }

  const adminUser = makeUser({
    role: 'admin',
    permissions: {
      'accounts.manage_admins': true,
      'testing.impersonate_head': true,
    },
  });
  const resolvedAdmin = resolveUserPermissions(adminUser);
  assert.equal(resolvedAdmin['accounts.manage_admins'], false);
  assert.equal(resolvedAdmin['testing.impersonate_head'], false);
  assert.equal(resolvedAdmin['applications.review'], true);
  assert.equal(resolvedAdmin['qr.scan'], true);

  const superAdmin = makeUser({ role: 'super_admin' });
  const resolvedSuper = resolveUserPermissions(superAdmin);
  for (const key of ALL_PERMISSION_KEYS) {
    assert.equal(resolvedSuper[key], true);
  }
});

test('Portal & Scanner isolation: non-security heads/EB/staff never get qr.scan or security portal', () => {
  const volunteerHead = makeUser({
    role: 'department_head',
    department_slug: 'volunteers',
    gender: 'female',
  });
  const volunteerPerms = resolveUserPermissions(volunteerHead);
  assert.equal(volunteerPerms['qr.scan'], false);
  assert.equal(volunteerPerms['applications.review'], false);
  assert.equal(volunteerPerms['applications.view_confidential'], false);
  assert.equal(canAccessPortal(volunteerHead, 'security'), false);
  assert.equal(canAccessPortal(volunteerHead, 'head'), true);

  const securityStaff = makeUser({
    role: 'staff',
    department_slug: 'security',
    gender: 'male',
  });
  assert.equal(resolveUserPermissions(securityStaff)['qr.scan'], true);
  assert.equal(canAccessPortal(securityStaff, 'security'), true);
});

test('Head Stage 1 pending-only isolation, gender/department scoping, and media_press sub-scope', () => {
  const maleSecHead = makeUser({
    role: 'department_head',
    department_slug: 'security',
    gender: 'male',
  });

  assert.deepEqual(
    canHeadAccessApplication(maleSecHead, makeApplication({ status: 'pending', gender: 'male', application_type: 'security' })),
    { scopeMatch: true, editable: true }
  );
  // Stage 2 Lock: accepted/rejected/waitlisted are locked for Heads
  assert.deepEqual(
    canHeadAccessApplication(maleSecHead, makeApplication({ status: 'accepted', gender: 'male', application_type: 'security' })),
    { scopeMatch: true, editable: false }
  );
  // Cross-gender & cross-department denied
  assert.deepEqual(
    canHeadAccessApplication(maleSecHead, makeApplication({ status: 'pending', gender: 'female', application_type: 'security' })),
    { scopeMatch: false, editable: false }
  );
  assert.deepEqual(
    canHeadAccessApplication(maleSecHead, makeApplication({ status: 'pending', gender: 'male', application_type: 'volunteers' })),
    { scopeMatch: false, editable: false }
  );

  // Media vs Press sub-scope isolation
  const femaleMediaOnlyHead = makeUser({
    role: 'department_head',
    department_slug: 'media_press',
    title: 'Media Head (Girls)',
    gender: 'female',
  });
  assert.deepEqual(
    canHeadAccessApplication(femaleMediaOnlyHead, makeApplication({ application_type: 'media', department_slug: 'media_press', gender: 'female', status: 'received' })),
    { scopeMatch: true, editable: true }
  );
  assert.deepEqual(
    canHeadAccessApplication(femaleMediaOnlyHead, makeApplication({ application_type: 'press', department_slug: 'media_press', gender: 'female', status: 'received' })),
    { scopeMatch: false, editable: false }
  );
});

test('redactApplicationForHead strips medical & admin Stage 2 attribution including media_medical_concerns', () => {
  const redacted = redactApplicationForHead(
    makeApplication({
      application_type: 'media',
      answers: {
        media_why_you: 'Answer text',
        media_medical_concerns: 'Asthma inhaler required',
      },
    })
  );
  assert.equal('medical_has_conditions' in redacted, false);
  assert.equal('medical_details' in redacted, false);
  assert.equal('media_medical_concerns' in redacted.answers, false);
  assert.equal(redacted.answers.media_why_you, 'Answer text');
  assert.equal(redacted.decision_by, null);
  assert.equal(redacted.decision_by_name, null);
  assert.equal(redacted.admin_decision_notes, null);
  assert.equal(redacted.review_notes, null);

  const headFormatted = formatApplicationAnswersForReview(
    makeApplication({
      application_type: 'media',
      answers: {
        media_equipment: 'Sony A7 IV',
        media_medical_concerns: 'Nut allergy',
      },
    }),
    { includeMedical: false }
  );
  assert.equal(headFormatted.some((x) => x.id === 'media_medical_concerns'), false);

  const adminFormatted = formatApplicationAnswersForReview(
    makeApplication({
      application_type: 'media',
      answers: {
        media_equipment: 'Sony A7 IV',
        media_medical_concerns: 'Nut allergy',
      },
    }),
    { includeMedical: true }
  );
  assert.equal(adminFormatted.some((x) => x.id === 'media_medical_concerns'), true);
});

test('Stealth spoof helpers, shift overlap detector, email sanitizer & template substitution', () => {
  assert.equal(
    cleanDecisionMakerName('Jane Admin (attributed by Super Admin: Root) [spoofed by root]'),
    'Jane Admin'
  );
  assert.equal(validateSpoofRequest({ targetStatus: 'accepted', attributedAdminId: '' }).valid, false);
  assert.equal(validateSpoofRequest({ targetStatus: 'accepted', attributedAdminId: 'adm-1' }).valid, true);
  assert.equal(validateSpoofRequest({ targetStatus: 'pending', attributedAdminId: '' }).valid, true);

  const overlap = detectShiftOverlap(
    [{ id: 's1', title: 'Gate A', starts_at: '2026-12-01T09:00:00Z', ends_at: '2026-12-01T12:00:00Z' }],
    { starts_at: '2026-12-01T11:30:00Z', ends_at: '2026-12-01T13:00:00Z' }
  );
  assert.equal(overlap?.id, 's1');

  const noOverlap = detectShiftOverlap(
    [{ id: 's1', title: 'Gate A', starts_at: '2026-12-01T09:00:00Z', ends_at: '2026-12-01T12:00:00Z' }],
    { starts_at: '2026-12-01T12:00:00Z', ends_at: '2026-12-01T14:00:00Z' }
  );
  assert.equal(noOverlap, null);

  const sanitizedErr = sanitizeEmailError('Error: Bearer sk_live_abc123 failed\n    at sendMail (/app/src/mail.ts:10)');
  assert.equal(sanitizedErr.includes('sk_live_abc123'), false);
  assert.equal(sanitizedErr.includes('Bearer [REDACTED]'), true);

  const tpl = resolveEmailTemplate(
    { subject: 'Hello {applicant_name}', body_text: 'Track: {{department}} Link: {{signup_link}}' },
    { applicant_name: 'Omar', department: 'Security', signup_link: 'https://lismun.org/team-signup?token=abc' }
  );
  assert.equal(tpl.subject, 'Hello Omar');
  assert.equal(tpl.bodyText, 'Track: Security Link: https://lismun.org/team-signup?token=abc');

  const replacedBody = applySignupLinkToBody(
    'Welcome!\nhttps://old.example.com/team-signup?token=0123456789abcdef',
    'https://lismun.org/team-signup?token=fedcba9876543210'
  );
  assert.equal(replacedBody.includes('fedcba9876543210'), true);
  assert.equal(replacedBody.includes('0123456789abcdef'), false);
});

test('Public intake validation enforces word counts (80/50/50/50 for Security) & legal checkboxes', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  assert.equal(wordCount('  hello   world  '), 2);
  assert.deepEqual(
    SECURITY_QUESTIONS.map((q) => q.minWords),
    [80, 50, 50, 50]
  );

  const invalid = validateTeamIntakePayload({
    track: 'security',
    gender: 'male',
    applicant_name: 'Tariq',
    email: 'tariq@example.com',
    phone: '+966501234567',
    emergency_phone: '+966507654321',
    institution: 'LIS',
    age: 17,
    answers: {
      security_emergency: words(79),
      security_teamwork: words(50),
      security_motivation: words(50),
      security_bullying: words(50),
    },
    privacy_policy_accepted: false,
    terms_accepted: true,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.security_emergency);
  assert.ok(invalid.errors.privacy_policy_accepted);

  const valid = validateTeamIntakePayload({
    track: 'security',
    gender: 'male',
    applicant_name: 'Tariq',
    email: 'tariq@example.com',
    phone: '+966501234567',
    emergency_phone: '+966507654321',
    institution: 'LIS',
    age: 17,
    answers: {
      security_emergency: words(80),
      security_teamwork: words(50),
      security_motivation: words(50),
      security_bullying: words(50),
    },
    privacy_policy_accepted: true,
    terms_accepted: true,
  });
  assert.equal(valid.valid, true);
});

test('Failed email deduplication excludes sent/manually-confirmed items & builds Gmail compose URL', () => {
  const deliveries: EmailDeliveryRecord[] = [
    {
      id: 'd1',
      application_id: 'a1',
      applicant_type: 'team',
      recipient_email: 'one@example.com',
      recipient_name: 'One',
      department_slug: 'security',
      template_key: 'acceptance',
      subject: 'Accepted',
      body_text: 'Body',
      status: 'failed',
      delivery_method: 'resend',
      provider_message_id: null,
      error_message: 'Quota exceeded',
      attempt_count: 1,
      sent_by: null,
      sent_by_name: null,
      created_at: '2026-05-01T10:00:00Z',
      sent_at: null,
    },
    {
      id: 'd2',
      application_id: 'a2',
      applicant_type: 'team',
      recipient_email: 'two@example.com',
      recipient_name: 'Two',
      department_slug: 'volunteers',
      template_key: 'rejection',
      subject: 'Update',
      body_text: 'Body',
      status: 'failed',
      delivery_method: 'resend',
      provider_message_id: null,
      error_message: 'Timeout',
      attempt_count: 1,
      sent_by: null,
      sent_by_name: null,
      created_at: '2026-05-01T11:00:00Z',
      sent_at: null,
    },
  ];

  const localFallback: FailedEmailItem[] = [
    {
      key: 'a1|acceptance',
      deliveryId: 'd1',
      applicationId: 'a1',
      applicantType: 'team',
      recipientName: 'One',
      recipientEmail: 'one@example.com',
      departmentSlug: 'security',
      emailType: 'acceptance',
      subject: 'Accepted',
      bodyText: 'Body',
      errorMessage: 'Quota exceeded',
      attemptCount: 1,
      failedAt: '2026-05-01T10:00:00Z',
      gmailOpenedAt: null,
    },
  ];

  const merged = mergeAndDeduplicateFailedEmails(
    deliveries,
    [
      {
        id: 'm1',
        application_id: 'a1',
        decision_status: 'acceptance',
        server_delivery_id: 'd1',
        recipient_name: 'One',
        recipient_email: 'one@example.com',
        department_slug: 'security',
        subject: 'Accepted',
        body_text: 'Body',
        confirmed_by_name: 'HR',
        confirmed_by_email: 'hr@lismun.org',
        attempt_count: 1,
        sent_at: '2026-05-01T10:05:00Z',
      },
    ],
    localFallback
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].applicationId, 'a2');

  const gmailUrl = buildGmailComposeUrl({
    to: 'two@example.com',
    subject: 'LIS MUN Decision',
    bodyText: 'Congratulations!\n{{signup_link}}',
    signupUrl: 'https://lismun.org/team-signup?token=abcdef',
  });
  const parsed = new URL(gmailUrl);
  assert.equal(parsed.origin, 'https://mail.google.com');
  assert.equal(parsed.searchParams.get('to'), 'two@example.com');
  assert.ok(parsed.searchParams.get('body')?.includes('https://lismun.org/team-signup?token=abcdef'));
});

test('Redesigned intake forms: Media Q11-Q18 rules, Volunteers Q11-Q13 isolation, Press separation, and Chair Q1-Q10', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

  assert.equal(MEDIA_QUESTIONS.length, 8);
  assert.equal(VOLUNTEER_QUESTIONS.length, 3);
  assert.ok(PRESS_QUESTIONS.every((q) => !q.id.startsWith('media_') && !q.id.startsWith('volunteer_')));

  const baseGeneral = {
    intake_version: 2,
    gender: 'female' as const,
    applicant_name: 'Layla Al-Mansour',
    email: 'layla@example.com',
    birth_date: '2009-05-14',
    grade_or_year: '11th Grade',
    institution: 'Leadership International School',
    phone: '+966501234567',
    emergency_phone: 'Mother - +966509876543',
    experience: 'Served as delegate at two regional MUN conferences.',
    privacy_policy_accepted: true,
    terms_accepted: true,
  };

  // Media under 40 words + Q15=No with N/A in Q18 must fail
  const invalidMedia = validateTeamIntakePayload({
    ...baseGeneral,
    track: 'media',
    answers: {
      media_why_you: words(25),
      media_equipment: 'Sony A7 III + 24-70mm',
      media_upload_device: 'Yes',
      media_why_team: words(39),
      media_attend_conference: 'No',
      media_attend_orientation: 'Yes',
      media_medical_concerns: 'N/A',
      media_anything_else: 'N/A',
    },
  });
  assert.equal(invalidMedia.valid, false);
  assert.ok(invalidMedia.errors.media_why_you);
  assert.ok(invalidMedia.errors.media_why_team);
  assert.ok(invalidMedia.errors.media_anything_else);

  // Valid Media with >= 40 words and real schedule explanation when Q15=No passes
  const validMedia = validateTeamIntakePayload({
    ...baseGeneral,
    track: 'media',
    answers: {
      media_why_you: words(40),
      media_equipment: 'Sony A7 III + 24-70mm + MacBook Pro SD adapter',
      media_upload_device: 'Yes',
      media_why_team: words(42),
      media_attend_conference: 'No',
      media_attend_orientation: 'Yes',
      media_medical_concerns: 'N/A',
      media_anything_else: 'I have a morning exam on Day 1 and arrive by 11:30 AM.',
    },
  });
  assert.equal(validMedia.valid, true);

  // Volunteers requires ONLY its 3 questions
  const validVolunteers = validateTeamIntakePayload({
    ...baseGeneral,
    track: 'volunteers',
    answers: {
      volunteer_why_lismun: 'I want to support smooth delegate floor operations.',
      volunteer_conflict_disrespect: 'Listen calmly, remain neutral, and escalate to supervisor.',
      volunteer_medical_emergency: 'Clear the area and immediately notify the medical team and supervisor.',
    },
  });
  assert.equal(validVolunteers.valid, true);

  // Press uses Press-only questions without Media equipment or Volunteers scenarios
  const validPress = validateTeamIntakePayload({
    ...baseGeneral,
    track: 'press',
    answers: {
      press_why_join: words(22),
      press_editorial_experience: 'School newspaper editor and conference dispatches.',
      press_fact_checking: 'Cross-verify direct quotes with delegate placards and resolution clauses.',
      press_availability: 'Available across orientation and all conference days.',
    },
  });
  assert.equal(validPress.valid, true);

  // Chair validates shared Q1-Q10 when intake_version=2
  const invalidChair = validateChairIntakePayload({
    intake_version: 2,
    full_name: 'L',
    email: 'bad-email',
    gender: 'male',
    birth_date: '2028-01-01',
    grade_or_year: 'Invalid Grade',
    institution: 'L',
    phone: '123',
    emergency_phone: '12',
    experience: '',
    statement: '',
    privacy_policy_accepted: false,
    terms_accepted: false,
  });
  assert.equal(invalidChair.valid, false);
  assert.ok(invalidChair.errors.birth_date);
  assert.ok(invalidChair.errors.grade_or_year);
  assert.ok(invalidChair.errors.statement);
});

