import type { ConferenceApplication } from './types.ts';

export const LEGAL_CONSENT_VERSION = '2026-11-26';

export const GRADE_OPTIONS = [
  '9th Grade',
  '10th Grade',
  '11th Grade',
  '12th Grade',
  'First year university',
] as const;

export type GradeOption = (typeof GRADE_OPTIONS)[number];

export interface CountryDialOption {
  code: string;
  dial: string;
  label: string;
}

export const COUNTRY_DIAL_CODES: readonly CountryDialOption[] = [
  { code: 'SA', dial: '+966', label: 'Saudi Arabia (+966)' },
  { code: 'AE', dial: '+971', label: 'United Arab Emirates (+971)' },
  { code: 'BH', dial: '+973', label: 'Bahrain (+973)' },
  { code: 'KW', dial: '+965', label: 'Kuwait (+965)' },
  { code: 'QA', dial: '+974', label: 'Qatar (+974)' },
  { code: 'OM', dial: '+968', label: 'Oman (+968)' },
  { code: 'EG', dial: '+20', label: 'Egypt (+20)' },
  { code: 'JO', dial: '+962', label: 'Jordan (+962)' },
  { code: 'LB', dial: '+961', label: 'Lebanon (+961)' },
  { code: 'GB', dial: '+44', label: 'United Kingdom (+44)' },
  { code: 'US', dial: '+1', label: 'United States / Canada (+1)' },
  { code: 'PK', dial: '+92', label: 'Pakistan (+92)' },
  { code: 'IN', dial: '+91', label: 'India (+91)' },
  { code: 'TR', dial: '+90', label: 'Turkey (+90)' },
  { code: 'DE', dial: '+49', label: 'Germany (+49)' },
  { code: 'FR', dial: '+33', label: 'France (+33)' },
  { code: 'INTL', dial: '+', label: 'Other International (+)' },
] as const;

export interface IntakeQuestion {
  id: string;
  number?: number;
  label: string;
  minWords: number;
  kind?: 'textarea' | 'yes_no';
  hint?: string;
  allowNA?: boolean;
  confidentialMedical?: boolean;
  placeholder: string;
}

export const SECURITY_QUESTIONS: readonly IntakeQuestion[] = [
  {
    id: 'security_why_join',
    number: 9,
    label: 'Why are you interested in joining LIS MUN as Security?',
    minWords: 1,
    kind: 'textarea',
    placeholder:
      'Share your motivation for serving in conference Security & Protocol and upholding safety across committees...',
  },
  {
    id: 'security_difference',
    number: 10,
    label: 'What makes you different from other candidates?',
    minWords: 1,
    kind: 'textarea',
    placeholder:
      'Highlight your discipline, situational awareness, composure under pressure, or leadership qualities...',
  },
  {
    id: 'security_negligent_teammate',
    number: 11,
    label:
      'You notice that one of your fellow security members is ignoring their responsibilities. What would you do?',
    minWords: 1,
    kind: 'textarea',
    placeholder:
      'Describe how you would address the situation professionally, protect coverage at the post, and follow chain of command...',
  },
  {
    id: 'security_allergies_has',
    number: 12,
    label: 'Do you have any allergies?',
    minWords: 1,
    kind: 'yes_no',
    hint: 'Select Yes or No. If Yes, please explain below so our team can accommodate you safely.',
    placeholder: 'Select Yes or No',
  },
  {
    id: 'security_additional_info_has',
    number: 13,
    label: 'Do you have any inquiries or additional information you would like us to know?',
    minWords: 1,
    kind: 'yes_no',
    hint: 'Select Yes or No. If Yes, please explain below.',
    placeholder: 'Select Yes or No',
  },
] as const;

export const MEDIA_QUESTIONS: readonly IntakeQuestion[] = [
  {
    id: 'media_why_you',
    number: 11,
    label: 'Why should we choose you over other applicants?',
    minWords: 40,
    kind: 'textarea',
    hint: 'Minimum 40 words required.',
    placeholder:
      'Highlight your visual craft, reliability under conference pressure, and what sets your work apart...',
  },
  {
    id: 'media_equipment',
    number: 12,
    label: 'What equipment do you use?',
    minWords: 1,
    kind: 'textarea',
    hint: 'Examples: camera, camera model, lenses, gimbal, microphone, etc.',
    placeholder:
      'List your camera body, model, lenses, audio gear, or phone/stabilizer setup...',
  },
  {
    id: 'media_upload_device',
    number: 13,
    label:
      'Do you have access to a device (e.g. laptop, adapter, or card reader) that allows you to upload footage from your camera to the shared drive?',
    minWords: 1,
    kind: 'yes_no',
    placeholder: 'Select Yes or No',
  },
  {
    id: 'media_why_team',
    number: 14,
    label: 'Why do you want to be part of this Media Team?',
    minWords: 40,
    kind: 'textarea',
    hint: 'Minimum 40 words required.',
    placeholder:
      'Share your motivation for documenting LIS MUN committees, debates, and conference atmosphere...',
  },
  {
    id: 'media_attend_conference',
    number: 15,
    label: 'Are you able to attend the entire MUN conference?',
    minWords: 1,
    kind: 'yes_no',
    hint: 'If you select No, please explain your schedule constraints in Question 18 below.',
    placeholder: 'Select Yes or No',
  },
  {
    id: 'media_attend_orientation',
    number: 16,
    label: 'Are you able to attend the orientation/meeting before the MUN?',
    minWords: 1,
    kind: 'yes_no',
    hint: 'If you select No, please explain your schedule constraints in Question 18 below.',
    placeholder: 'Select Yes or No',
  },
  {
    id: 'media_medical_concerns',
    number: 17,
    label: 'Do you have any medical concerns we should be aware of?',
    minWords: 1,
    kind: 'textarea',
    allowNA: true,
    confidentialMedical: true,
    hint: 'Enter N/A if none apply. Visible only to authorized Secretariat Admins.',
    placeholder: 'Describe any allergies or medical considerations, or write N/A...',
  },
  {
    id: 'media_anything_else',
    number: 18,
    label: 'Anything else you would like us to know?',
    minWords: 1,
    kind: 'textarea',
    allowNA: true,
    hint: 'Enter N/A if nothing additional applies, unless you answered No to Question 15 or 16.',
    placeholder:
      'Include availability explanations if you selected No above, portfolio links, or write N/A...',
  },
] as const;

export const VOLUNTEER_QUESTIONS: readonly IntakeQuestion[] = [
  {
    id: 'volunteer_why_lismun',
    number: 11,
    label: 'Why do you want to join LIS MUN?',
    minWords: 1,
    kind: 'textarea',
    placeholder:
      'Share what motivates you to serve as a conference volunteer and support delegates throughout LIS MUN...',
  },
  {
    id: 'volunteer_conflict_disrespect',
    number: 12,
    label:
      'If a delegate comes to you complaining that another delegate disrespected them, what would you do?',
    minWords: 1,
    kind: 'textarea',
    hint: 'Explain how you listen calmly, uphold professionalism, avoid taking sides, and escalate serious matters to your supervisor.',
    placeholder:
      'Outline your step-by-step response to de-escalate the concern and notify the appropriate supervisor...',
  },
  {
    id: 'volunteer_medical_emergency',
    number: 13,
    label: 'What would you do in the case of a medical emergency?',
    minWords: 1,
    kind: 'textarea',
    hint: 'Explain how you keep the area calm and immediately notify the designated medical team or conference supervisors.',
    placeholder:
      'Describe your immediate emergency steps, communication with supervisors/medical staff, and crowd control...',
  },
] as const;

export const PRESS_QUESTIONS: readonly IntakeQuestion[] = [
  {
    id: 'press_why_join',
    number: 11,
    label: 'Why do you want to join the LIS MUN Press Corps?',
    minWords: 20,
    kind: 'textarea',
    hint: 'Minimum 20 words recommended.',
    placeholder:
      'Describe your interest in diplomatic journalism, conference reporting, and editorial storytelling...',
  },
  {
    id: 'press_editorial_experience',
    number: 12,
    label:
      'What writing formats, newsroom workflows, or editorial coverage styles are you most comfortable producing?',
    minWords: 1,
    kind: 'textarea',
    placeholder:
      'Examples: committee dispatches, delegate interviews, investigative briefings, live breaking updates...',
  },
  {
    id: 'press_fact_checking',
    number: 13,
    label:
      'How do you verify quotes, fact-check resolution claims, and maintain journalistic neutrality under fast conference deadlines?',
    minWords: 1,
    kind: 'textarea',
    placeholder:
      'Explain your verification process, source attribution habits, and editorial balance...',
  },
  {
    id: 'press_availability',
    number: 14,
    label:
      'Confirm your availability across orientation, full conference days, and rapid end-of-day editorial deadlines.',
    minWords: 1,
    kind: 'textarea',
    placeholder:
      'Confirm full attendance or describe any scheduling commitments...',
  },
] as const;

export const QUESTIONS_BY_TRACK: Record<
  'security' | 'media' | 'press' | 'volunteers',
  readonly IntakeQuestion[]
> = {
  security: SECURITY_QUESTIONS,
  media: MEDIA_QUESTIONS,
  press: PRESS_QUESTIONS,
  volunteers: VOLUNTEER_QUESTIONS,
};

// Map legacy & current keys to human-readable labels for Admin/Head review panels
const LEGACY_AND_CURRENT_LABELS: Record<string, string> = {
  security_emergency: 'Emergency Problem-Solving Scenario',
  security_teamwork: 'Teamwork & Chain of Command',
  security_motivation: 'Motivation & Commitment',
  security_bullying: 'Handling Harassment or Bullying',
  security_allergies_details: 'Allergy Details & Accommodations',
  security_additional_info_details: 'Inquiries / Additional Information Details',
  media_storytelling: 'Visual Storytelling Approach',
  media_turnaround: 'Same-Day Rapid Turnaround',
  media_editorial: 'Press & Journalistic Accuracy',
  media_availability: 'Full-Conference Coverage Readiness',
  volunteer_skills: 'Special Skills & Strengths',
  volunteer_conflict: 'Teamwork Conflict Resolution',
  volunteer_emergency: 'Emergency Reaction',
  volunteer_professionalism: 'Delegate Professionalism',
  committee_preferences: 'Preferred Committee(s)',
  portfolio_url: 'Portfolio URL',
};

for (const list of [SECURITY_QUESTIONS, MEDIA_QUESTIONS, VOLUNTEER_QUESTIONS, PRESS_QUESTIONS]) {
  for (const q of list) {
    LEGACY_AND_CURRENT_LABELS[q.id] = q.label;
  }
}

export function wordCount(value: string | null | undefined): number {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function isValidHttpUrl(value: string | null | undefined): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isNAValue(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'n/a' || normalized === 'na' || normalized === 'none' || normalized === 'nil';
}

export function computeAgeFromBirthDate(birthDate: string | null | undefined): number | null {
  const raw = String(birthDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (dt.getTime() > todayUtc) return null;

  let age = now.getUTCFullYear() - y;
  const monthDiff = now.getUTCMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d)) {
    age -= 1;
  }
  return age;
}

export function parseYesNo(value: string | null | undefined): 'Yes' | 'No' | '' {
  const norm = String(value ?? '').trim().toLowerCase();
  if (norm === 'yes') return 'Yes';
  if (norm === 'no') return 'No';
  return '';
}

export interface TeamIntakePayload {
  intake_version?: number;
  track: 'security' | 'media' | 'press' | 'volunteers';
  gender: 'male' | 'female';
  applicant_name: string;
  email: string;
  phone: string;
  emergency_phone: string;
  institution: string;
  grade_or_year: string;
  birth_date?: string;
  age?: number;
  position?: string;
  experience: string;
  statement?: string;
  portfolio_url?: string;
  answers: Record<string, string>;
  medical_has_conditions?: boolean;
  medical_details?: string;
  privacy_policy_accepted: boolean;
  terms_accepted: boolean;
  website?: string; // honeypot
}

export interface ChairIntakePayload {
  intake_version?: number;
  full_name: string;
  email: string;
  gender: 'male' | 'female';
  birth_date?: string;
  age?: number;
  grade_or_year: string;
  institution: string;
  phone: string;
  emergency_phone: string;
  experience: string;
  committee_preferences?: string;
  statement: string;
  attachments?: unknown[];
  privacy_policy_accepted: boolean;
  terms_accepted: boolean;
  website?: string;
}

export function validateGeneralInfoFields(
  input: {
    applicant_name?: string;
    email?: string;
    gender?: string;
    birth_date?: string;
    age?: number;
    grade_or_year?: string;
    institution?: string;
    phone?: string;
    emergency_phone?: string;
    experience?: string;
  },
  options: { strictV2?: boolean; track?: string } = {}
): Record<string, string> {
  const errors: Record<string, string> = {};
  const strict = Boolean(options.strictV2);
  const isSecurity = options.track === 'security';

  if (!input.gender || !['male', 'female'].includes(input.gender)) {
    errors.gender = 'Please select Female or Male division.';
  }
  const name = String(input.applicant_name ?? '').trim();
  if (!name || name.length < 2) {
    errors.applicant_name = 'Full name is required.';
  }
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'A valid email address is required.';
  }

  if (isSecurity) {
    if (input.birth_date && computeAgeFromBirthDate(input.birth_date) === null) {
      errors.birth_date = 'Please enter a valid birth date.';
    }
  } else if (strict || input.birth_date !== undefined) {
    const computedAge = computeAgeFromBirthDate(input.birth_date);
    if (computedAge === null || computedAge < 12 || computedAge > 35) {
      errors.birth_date = 'Please enter a valid birth date (applicant age must be between 12 and 35).';
    }
  } else {
    const age = Number(input.age);
    if (!Number.isFinite(age) || age < 14 || age > 35) {
      errors.age = 'Applicant age must be between 14 and 35.';
    }
  }

  if (isSecurity) {
    const grade = String(input.grade_or_year ?? '').trim();
    if (!grade) {
      errors.grade_or_year = 'Please select or enter your grade level.';
    }
  } else if (strict) {
    const grade = String(input.grade_or_year ?? '').trim();
    if (!GRADE_OPTIONS.includes(grade as GradeOption)) {
      errors.grade_or_year = 'Please select your grade level.';
    }
  }

  const inst = String(input.institution ?? '').trim();
  if (!inst || ((strict || isSecurity) && inst.length < 3)) {
    errors.institution = 'Full school name is required (please avoid abbreviations).';
  }

  if (String(input.phone ?? '').replace(/\D/g, '').length < 7) {
    errors.phone = 'Valid phone number with country code is required.';
  }

  const emergencyRaw = String(input.emergency_phone ?? '').trim();
  if (isSecurity) {
    if (emergencyRaw.replace(/\D/g, '').length < 7) {
      errors.emergency_phone = "A valid guardian's phone number is required.";
    }
  } else if (strict) {
    if (emergencyRaw.length < 5) {
      errors.emergency_phone = 'Please provide an emergency contact.';
    }
  } else if (emergencyRaw.replace(/\D/g, '').length < 7) {
    errors.emergency_phone = 'Valid emergency/guardian phone number is required.';
  }

  if (strict || isSecurity) {
    const exp = String(input.experience ?? '').trim();
    if (!exp || exp.length < 2) {
      errors.experience = 'Please list your previous experiences (or enter None if first time).';
    }
  }

  return errors;
}

export function validateTeamIntakePayload(
  payload: Partial<TeamIntakePayload>
): { valid: boolean; errors: Record<string, string> } {
  const strictV2 =
    payload.track !== 'security' &&
    (payload.intake_version === 2 ||
      payload.birth_date !== undefined ||
      payload.track === 'media');

  const errors: Record<string, string> = validateGeneralInfoFields(payload, {
    strictV2,
    track: payload.track,
  });

  if (!payload.track || !['security', 'media', 'press', 'volunteers'].includes(payload.track)) {
    errors.track = 'Select a valid conference team track.';
  }
  if (payload.privacy_policy_accepted !== true) {
    errors.privacy_policy_accepted = 'You must accept the Privacy Policy.';
  }
  if (payload.terms_accepted !== true) {
    errors.terms_accepted = 'You must accept the Terms & Conditions.';
  }

  const answers = payload.answers ?? {};
  if (payload.track === 'security') {
    for (const q of SECURITY_QUESTIONS) {
      const raw = String(answers[q.id] ?? '').trim();
      if (q.kind === 'yes_no') {
        if (!parseYesNo(raw)) {
          errors[q.id] = `Please select Yes or No for: ${q.label}`;
        }
        continue;
      }
      const wc = wordCount(raw);
      if (wc < q.minWords) {
        errors[q.id] =
          q.minWords > 1
            ? `${q.label} requires at least ${q.minWords} words (currently ${wc}).`
            : `Please provide a response for: ${q.label}`;
      }
    }
    if (parseYesNo(answers.security_allergies_has) === 'Yes') {
      const details = String(answers.security_allergies_details ?? '').trim();
      if (details.length < 2) {
        errors.security_allergies_details = 'Please describe your allergies above.';
      }
    }
    if (parseYesNo(answers.security_additional_info_has) === 'Yes') {
      const infoDetails = String(answers.security_additional_info_details ?? '').trim();
      if (infoDetails.length < 2) {
        errors.security_additional_info_details =
          'Please enter your inquiry or additional information.';
      }
    }
  } else if (payload.track === 'volunteers') {
    for (const q of VOLUNTEER_QUESTIONS) {
      if (wordCount(answers[q.id]) < q.minWords) {
        errors[q.id] = `${q.label} response is required.`;
      }
    }
  } else if (payload.track === 'media') {
    if (payload.portfolio_url && !isValidHttpUrl(payload.portfolio_url)) {
      errors.portfolio_url = 'Portfolio URL must start with http:// or https://.';
    }
    for (const q of MEDIA_QUESTIONS) {
      const raw = String(answers[q.id] ?? '').trim();
      if (q.kind === 'yes_no') {
        if (!parseYesNo(raw)) {
          errors[q.id] = `Please select Yes or No for: ${q.label}`;
        }
        continue;
      }
      const wc = wordCount(raw);
      if (wc < q.minWords) {
        errors[q.id] =
          q.minWords > 1
            ? `${q.label} requires at least ${q.minWords} words (currently ${wc}).`
            : `Please provide a response for: ${q.label}`;
      }
    }
    const attendConf = parseYesNo(answers.media_attend_conference);
    const attendOrient = parseYesNo(answers.media_attend_orientation);
    if (attendConf === 'No' || attendOrient === 'No') {
      const finalAns = String(answers.media_anything_else ?? '').trim();
      if (!finalAns || isNAValue(finalAns) || wordCount(finalAns) < 3) {
        errors.media_anything_else =
          'Because you selected No for conference or orientation attendance, please explain your scheduling details in Question 18.';
      }
    }
  } else if (payload.track === 'press') {
    if (payload.portfolio_url && !isValidHttpUrl(payload.portfolio_url)) {
      errors.portfolio_url = 'Portfolio URL must start with http:// or https://.';
    }
    for (const q of PRESS_QUESTIONS) {
      const wc = wordCount(answers[q.id]);
      if (wc < q.minWords) {
        errors[q.id] =
          q.minWords > 1
            ? `${q.label} requires at least ${q.minWords} words (currently ${wc}).`
            : `Please provide a response for: ${q.label}`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateChairIntakePayload(
  payload: Partial<ChairIntakePayload>
): { valid: boolean; errors: Record<string, string> } {
  const strictV2 = payload.intake_version === 2 || payload.birth_date !== undefined;
  const errors: Record<string, string> = strictV2
    ? validateGeneralInfoFields(
        {
          applicant_name: payload.full_name,
          email: payload.email,
          gender: payload.gender,
          birth_date: payload.birth_date,
          age: payload.age,
          grade_or_year: payload.grade_or_year,
          institution: payload.institution,
          phone: payload.phone,
          emergency_phone: payload.emergency_phone,
          experience: payload.experience,
        },
        { strictV2: true }
      )
    : {};

  if (!strictV2) {
    if (String(payload.full_name ?? '').trim().length < 2) errors.applicant_name = 'Full name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email ?? '').trim().toLowerCase())) {
      errors.email = 'Valid email address is required.';
    }
    if (!String(payload.institution ?? '').trim()) errors.institution = 'Institution is required.';
    if (!String(payload.experience ?? '').trim()) errors.experience = 'Previous experiences are required.';
  }

  if (!String(payload.statement ?? '').trim()) {
    errors.statement = 'Academic and procedural chairing statement is required.';
  }
  if (payload.privacy_policy_accepted !== true) {
    errors.privacy_policy_accepted = 'You must accept the Privacy Policy.';
  }
  if (payload.terms_accepted !== true) {
    errors.terms_accepted = 'You must accept the Terms & Conditions.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export interface FormattedReviewAnswer {
  id: string;
  numberLabel?: string;
  questionLabel: string;
  answerText: string;
  confidentialMedical?: boolean;
}

export function formatApplicationAnswersForReview(
  app: Pick<ConferenceApplication, 'application_type' | 'answers'>,
  options: { includeMedical?: boolean } = {}
): FormattedReviewAnswer[] {
  const raw = app.answers && typeof app.answers === 'object' ? app.answers : {};
  const includeMedical = Boolean(options.includeMedical);
  const track = app.application_type;
  const knownOrder =
    track === 'media'
      ? MEDIA_QUESTIONS
      : track === 'volunteers'
      ? VOLUNTEER_QUESTIONS
      : track === 'press'
      ? PRESS_QUESTIONS
      : track === 'security'
      ? SECURITY_QUESTIONS
      : [];

  const result: FormattedReviewAnswer[] = [];
  const seen = new Set<string>();

  for (const q of knownOrder) {
    if (q.confidentialMedical && !includeMedical) {
      seen.add(q.id);
      continue;
    }
    const val = raw[q.id];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      let answerText = String(val).trim();
      if (q.id === 'security_allergies_has') {
        seen.add('security_allergies_details');
        const detail = String(raw.security_allergies_details ?? '').trim();
        if (parseYesNo(answerText) === 'Yes' && detail) {
          answerText = `Yes — ${detail}`;
        }
      } else if (q.id === 'security_additional_info_has') {
        seen.add('security_additional_info_details');
        const detail = String(raw.security_additional_info_details ?? '').trim();
        if (parseYesNo(answerText) === 'Yes' && detail) {
          answerText = `Yes — ${detail}`;
        }
      }
      result.push({
        id: q.id,
        numberLabel: q.number ? `Q${q.number}` : undefined,
        questionLabel: q.label,
        answerText,
        confidentialMedical: q.confidentialMedical,
      });
    }
    seen.add(q.id);
  }

  for (const [key, val] of Object.entries(raw)) {
    if (seen.has(key)) continue;
    if (key === 'media_medical_concerns' && !includeMedical) continue;
    if (key === 'intake_version' || key === 'country_code') continue;
    if (val === undefined || val === null || String(val).trim() === '') continue;
    result.push({
      id: key,
      questionLabel: LEGACY_AND_CURRENT_LABELS[key] || key.replace(/_/g, ' '),
      answerText: String(val).trim(),
    });
  }

  return result;
}
