export const LEGAL_CONSENT_VERSION = '2026-11-22';

export interface IntakeQuestion {
  id: string;
  label: string;
  minWords: number;
  placeholder: string;
}

export const SECURITY_QUESTIONS: readonly IntakeQuestion[] = [
  {
    id: 'security_emergency',
    label: 'Emergency Problem-Solving Scenario',
    minWords: 80,
    placeholder:
      'Describe step-by-step how you de-escalate an unauthorized entry or medical/fire alarm incident at a conference gate while maintaining delegate calm and chain-of-command...',
  },
  {
    id: 'security_teamwork',
    label: 'Teamwork & Chain of Command',
    minWords: 50,
    placeholder:
      'Explain how you coordinate shift handoffs, radio protocols, and conflicting directives between fellow security officers and your Security Head...',
  },
  {
    id: 'security_motivation',
    label: 'Motivation & Commitment',
    minWords: 50,
    placeholder:
      'Why do you want to serve in LIS MUN Security & Protocol, and how will you uphold professionalism throughout long conference days...',
  },
  {
    id: 'security_bullying',
    label: 'Handling Harassment or Bullying',
    minWords: 50,
    placeholder:
      'Detail how you respond if you observe delegate harassment, bullying, or hostile behavior in corridors while protecting privacy and safety...',
  },
] as const;

export const VOLUNTEER_QUESTIONS: readonly IntakeQuestion[] = [
  {
    id: 'volunteer_skills',
    label: 'Special Skills & Strengths',
    minWords: 1,
    placeholder: 'Share organizational, hospitality, or logistics strengths you bring to committee floor operations...',
  },
  {
    id: 'volunteer_conflict',
    label: 'Teamwork Conflict Resolution',
    minWords: 1,
    placeholder: 'How do you handle disagreement with a fellow runner or chair request during peak session hours...',
  },
  {
    id: 'volunteer_emergency',
    label: 'Emergency Reaction',
    minWords: 1,
    placeholder: 'If a speaker collapses or an urgent chamber stoppage happens, what is your immediate protocol...',
  },
  {
    id: 'volunteer_professionalism',
    label: 'Delegate Professionalism',
    minWords: 1,
    placeholder: 'How do you maintain poise, neutrality, and discretion while passing directives or assisting delegates...',
  },
] as const;

export const MEDIA_QUESTIONS: readonly IntakeQuestion[] = [
  {
    id: 'media_equipment',
    label: 'Camera / Editing Gear & Software',
    minWords: 1,
    placeholder: 'List cameras, lenses, audio gear, or editing suites (Lightroom, Premiere, Figma, etc.) you use...',
  },
  {
    id: 'media_storytelling',
    label: 'Visual Storytelling Approach',
    minWords: 1,
    placeholder: 'Describe how you capture authentic diplomatic tension and documentary moments without disrupting debate...',
  },
  {
    id: 'media_turnaround',
    label: 'Same-Day Rapid Turnaround',
    minWords: 1,
    placeholder: 'How do you cull, color-grade, and deliver same-day highlight reels or articles on tight conference deadlines...',
  },
  {
    id: 'media_editorial',
    label: 'Press & Journalistic Accuracy',
    minWords: 1,
    placeholder: 'How do you verify quotes, attribution, and diplomatic neutrality when covering controversial resolutions...',
  },
  {
    id: 'media_availability',
    label: 'Full-Conference Coverage Readiness',
    minWords: 1,
    placeholder: 'Confirm your availability for opening ceremony, full committee days, and closing evening edit sprints...',
  },
] as const;

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

export interface TeamIntakePayload {
  track: 'security' | 'media' | 'press' | 'volunteers';
  gender: 'male' | 'female';
  applicant_name: string;
  email: string;
  phone: string;
  emergency_phone: string;
  institution: string;
  grade_or_year: string;
  age: number;
  experience: string;
  statement: string;
  portfolio_url?: string;
  answers: Record<string, string>;
  medical_has_conditions: boolean;
  medical_details: string;
  privacy_policy_accepted: boolean;
  terms_accepted: boolean;
  website?: string; // honeypot
}

export function validateTeamIntakePayload(
  payload: Partial<TeamIntakePayload>
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!payload.track || !['security', 'media', 'press', 'volunteers'].includes(payload.track)) {
    errors.track = 'Select a valid conference team track.';
  }
  if (!payload.gender || !['male', 'female'].includes(payload.gender)) {
    errors.gender = 'Select male or female section.';
  }
  if (!String(payload.applicant_name ?? '').trim() || String(payload.applicant_name).trim().length < 2) {
    errors.applicant_name = 'Full name is required.';
  }
  const email = String(payload.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Valid email address is required.';
  }
  if (String(payload.phone ?? '').replace(/\D/g, '').length < 7) {
    errors.phone = 'Valid applicant phone number is required.';
  }
  if (String(payload.emergency_phone ?? '').replace(/\D/g, '').length < 7) {
    errors.emergency_phone = 'Valid emergency/guardian phone number is required.';
  }
  if (!String(payload.institution ?? '').trim()) {
    errors.institution = 'School or university name is required.';
  }
  const age = Number(payload.age);
  if (!Number.isFinite(age) || age < 14 || age > 35) {
    errors.age = 'Applicant age must be between 14 and 35.';
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
      const wc = wordCount(answers[q.id]);
      if (wc < q.minWords) {
        errors[q.id] = `${q.label} requires at least ${q.minWords} words (currently ${wc}).`;
      }
    }
  } else if (payload.track === 'volunteers') {
    for (const q of VOLUNTEER_QUESTIONS) {
      if (wordCount(answers[q.id]) < q.minWords) {
        errors[q.id] = `${q.label} response is required.`;
      }
    }
  } else if (payload.track === 'media' || payload.track === 'press') {
    if (payload.portfolio_url && !isValidHttpUrl(payload.portfolio_url)) {
      errors.portfolio_url = 'Portfolio URL must start with http:// or https://.';
    }
    for (const q of MEDIA_QUESTIONS) {
      if (wordCount(answers[q.id]) < q.minWords) {
        errors[q.id] = `${q.label} response is required.`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
