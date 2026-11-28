import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { apiRequest } from '../api';
import { navigate } from '../router';
import {
  COUNTRY_DIAL_CODES,
  GRADE_OPTIONS,
  MEDIA_QUESTIONS,
  PRESS_QUESTIONS,
  SECURITY_QUESTIONS,
  VOLUNTEER_QUESTIONS,
  computeAgeFromBirthDate,
  isNAValue,
  parseYesNo,
  validateGeneralInfoFields,
  validateTeamIntakePayload,
  wordCount,
  type IntakeQuestion,
} from '../../shared/intake';
import type {
  ApplicationAttachmentRef,
  DepartmentRecord,
} from '../../shared/types';
import { StatusLabel } from './UiPrimitives';
import {
  DiplomaticWaxSeal,
  GoldParticlesCanvas,
  LaurelWreathAccent,
} from '../../components/LuxuryOrnaments';

type TeamTrack = 'media' | 'volunteers' | 'press' | 'security';
type WizardStep = 1 | 2 | 3 | 4;

const DRAFT_STORAGE_KEY = 'lismun_application_draft_v2';
const MAX_CLIENT_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);

const TRACK_CATALOG: ReadonlyArray<{
  id: TeamTrack;
  title: string;
  tagline: string;
  questionCount: number;
  summaryLabel: string;
}> = [
  {
    id: 'media',
    title: 'Media',
    tagline: 'Photography, videography, and live visual storytelling across committees.',
    questionCount: MEDIA_QUESTIONS.length,
    summaryLabel: `10 General + ${MEDIA_QUESTIONS.length} Department Questions`,
  },
  {
    id: 'volunteers',
    title: 'Volunteers',
    tagline: 'Committee floor runners, delegate support, and conference hospitality.',
    questionCount: VOLUNTEER_QUESTIONS.length,
    summaryLabel: `10 General + ${VOLUNTEER_QUESTIONS.length} Department Questions`,
  },
  {
    id: 'press',
    title: 'Press',
    tagline: 'Conference journalism, dispatches, interviews, and diplomatic reporting.',
    questionCount: PRESS_QUESTIONS.length,
    summaryLabel: `10 General + ${PRESS_QUESTIONS.length} Department Questions`,
  },
  {
    id: 'security',
    title: 'Security',
    tagline: 'Venue access control, QR gate verification, and protocol safety.',
    questionCount: SECURITY_QUESTIONS.length,
    summaryLabel: `8 Personal & Experience + ${SECURITY_QUESTIONS.length} Security Questions`,
  },
];

interface SavedDraftState {
  step: WizardStep;
  track: TeamTrack;
  gender: 'male' | 'female' | '';
  applicantName: string;
  email: string;
  birthDate: string;
  gradeOrYear: string;
  institution: string;
  countryCode: string;
  phoneLocal: string;
  emergencyContact: string;
  experience: string;
  attachments: ApplicationAttachmentRef[];
  answersByTrack: Record<TeamTrack, Record<string, string>>;
  portfolioUrl: string;
  medHas: boolean;
  medDetails: string;
}

const EMPTY_ANSWERS_BY_TRACK: Record<TeamTrack, Record<string, string>> = {
  media: {},
  volunteers: {},
  press: {},
  security: {},
};

function readInitialDraft(): Partial<SavedDraftState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<SavedDraftState>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const LUXURY_INPUT_CLS =
  'mt-1.5 w-full border border-[#B89A62]/30 bg-[#040D1B] px-3.5 py-2.5 text-sm text-[#E8E1D2] placeholder-[#E8E1D2]/35 transition-colors focus:border-[#D5BD8B] focus:outline-none focus:ring-1 focus:ring-[#83B5ED]/35';

export const PublicApplicationPage: React.FC<{
  embedded?: boolean;
}> = ({ embedded = false }) => {
  const wizardRef = useRef<HTMLDivElement>(null);
  const initialDraft = useMemo(() => readInitialDraft(), []);

  const scrollWizardIntoView = () => {
    if (typeof window === 'undefined') return;
    if (embedded && wizardRef.current) {
      wizardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const [step, setStep] = useState<WizardStep>(
    initialDraft.step && [1, 2, 3, 4].includes(initialDraft.step)
      ? initialDraft.step
      : 1
  );
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successReceipt, setSuccessReceipt] = useState<{
    code: string;
    department: string;
    submittedAt: string;
  } | null>(null);

  // Track selection
  const [track, setTrack] = useState<TeamTrack>(initialDraft.track ?? 'media');

  // Shared General Information (Q1–Q10) / Security Personal & Experience (1–8)
  const [applicantName, setApplicantName] = useState(initialDraft.applicantName ?? '');
  const [email, setEmail] = useState(initialDraft.email ?? '');
  const [gender, setGender] = useState<'male' | 'female' | ''>(initialDraft.gender ?? '');
  const [birthDate, setBirthDate] = useState(initialDraft.birthDate ?? '');
  const [gradeOrYear, setGradeOrYear] = useState(initialDraft.gradeOrYear ?? '');
  const [institution, setInstitution] = useState(initialDraft.institution ?? '');
  const [countryCode, setCountryCode] = useState(initialDraft.countryCode ?? 'SA');
  const [phoneLocal, setPhoneLocal] = useState(initialDraft.phoneLocal ?? '');
  const [emergencyContact, setEmergencyContact] = useState(initialDraft.emergencyContact ?? '');
  const [experience, setExperience] = useState(initialDraft.experience ?? '');
  const [attachments, setAttachments] = useState<ApplicationAttachmentRef[]>(
    Array.isArray(initialDraft.attachments) ? initialDraft.attachments : []
  );
  const [uploadingCount, setUploadingCount] = useState(0);

  // Department-specific answers isolated per department key
  const [answersByTrack, setAnswersByTrack] = useState<Record<TeamTrack, Record<string, string>>>({
    ...EMPTY_ANSWERS_BY_TRACK,
    ...(initialDraft.answersByTrack ?? {}),
  });
  const [portfolioUrl, setPortfolioUrl] = useState(initialDraft.portfolioUrl ?? '');
  const [medHas, setMedHas] = useState(Boolean(initialDraft.medHas));
  const [medDetails, setMedDetails] = useState(initialDraft.medDetails ?? '');

  // Legal Consent ALWAYS defaults unchecked
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const activeDialOption = useMemo(
    () => COUNTRY_DIAL_CODES.find((c) => c.code === countryCode) ?? COUNTRY_DIAL_CODES[0],
    [countryCode]
  );
  const combinedPhone = useMemo(() => {
    const trimmed = phoneLocal.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('+')) return trimmed;
    const dial = activeDialOption.dial === '+' ? '+' : activeDialOption.dial;
    const cleaned = trimmed.replace(/^0+/, '').replace(/[^\d\s-]/g, '');
    const raw = `${dial}${cleaned}`;
    const parsed =
      COUNTRY_DIAL_CODES.some((c) => c.code === countryCode && c.code !== 'INTL')
        ? parsePhoneNumberFromString(raw, countryCode as never)
        : parsePhoneNumberFromString(raw);
    return parsed?.isValid() ? parsed.number : raw.replace(/\s+/g, '');
  }, [activeDialOption.dial, countryCode, phoneLocal]);

  // Persist draft automatically across refreshes
  useEffect(() => {
    if (successReceipt || typeof window === 'undefined') return;
    const draft: SavedDraftState = {
      step,
      track,
      gender,
      applicantName,
      email,
      birthDate,
      gradeOrYear,
      institution,
      countryCode,
      phoneLocal,
      emergencyContact,
      experience,
      attachments,
      answersByTrack,
      portfolioUrl,
      medHas,
      medDetails,
    };
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage quota errors
    }
  }, [
    step,
    track,
    gender,
    applicantName,
    email,
    birthDate,
    gradeOrYear,
    institution,
    countryCode,
    phoneLocal,
    emergencyContact,
    experience,
    attachments,
    answersByTrack,
    portfolioUrl,
    medHas,
    medDetails,
    successReceipt,
  ]);

  // Live availability polling
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiRequest<{
          departments: DepartmentRecord[];
          settings: Record<string, unknown>;
        }>('/api/public/overview');
        if (!active) return;
        setDepartments(res.departments || []);
        setSettings(res.settings || {});
      } catch {
        // Ignore transient poll errors
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const isTrackOpen = (t: TeamTrack): boolean => {
    const slug = t === 'media' || t === 'press' ? 'media_press' : t;
    const dept = departments.find((d) => d.slug === slug);
    const deptOpen = dept ? dept.registration_open : true;
    const sw = settings[`team_${t}_open`];
    const switchOpen = sw !== false && sw !== 'false';
    return deptOpen && switchOpen;
  };

  const activeAnswers = answersByTrack[track] ?? {};
  const activeQuestions: readonly IntakeQuestion[] =
    track === 'media'
      ? MEDIA_QUESTIONS
      : track === 'volunteers'
      ? VOLUNTEER_QUESTIONS
      : track === 'press'
      ? PRESS_QUESTIONS
      : SECURITY_QUESTIONS;

  const updateAnswer = (qId: string, val: string) => {
    setAnswersByTrack((prev) => ({
      ...prev,
      [track]: {
        ...(prev[track] ?? {}),
        [qId]: val,
      },
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      let changed = false;
      if (next[qId]) {
        delete next[qId];
        changed = true;
      }
      if (qId === 'security_allergies_has' && next.security_allergies_details) {
        delete next.security_allergies_details;
        changed = true;
      }
      if (qId === 'security_additional_info_has' && next.security_additional_info_details) {
        delete next.security_additional_info_details;
        changed = true;
      }
      return changed ? next : prev;
    });
  };

  const clearSavedDraft = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    setStep(1);
    setGender('');
    setApplicantName('');
    setEmail('');
    setBirthDate('');
    setGradeOrYear('');
    setInstitution('');
    setCountryCode('SA');
    setPhoneLocal('');
    setEmergencyContact('');
    setExperience('');
    setAttachments([]);
    setAnswersByTrack(EMPTY_ANSWERS_BY_TRACK);
    setPortfolioUrl('');
    setMedHas(false);
    setMedDetails('');
    setPrivacyAccepted(false);
    setTermsAccepted(false);
    setFieldErrors({});
    setErrorMsg('');
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg('');
    const files = Array.from(fileList);
    const uploadTrack = track;

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const mime = (file.type || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME.has(mime)) {
        setErrorMsg(
          `File "${file.name}" is not supported. Please attach PDF, JPG, JPEG, or PNG files only.`
        );
        continue;
      }
      if (file.size <= 0 || file.size > MAX_CLIENT_FILE_BYTES) {
        setErrorMsg(`File "${file.name}" must be under 15 MB.`);
        continue;
      }

      const resolvedMime =
        mime === 'image/jpg'
          ? 'image/jpeg'
          : mime || (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg');

      setUploadingCount((c) => c + 1);
      try {
        const init = await apiRequest<{ uploadUrl: string }>('/api/public/files/init-upload', {
          method: 'POST',
          body: {
            application_type: uploadTrack,
            file_name: file.name,
            mime_type: resolvedMime,
            size_bytes: file.size,
          },
          skipAuth: true,
        });
        const up = await apiRequest<{ attachment: ApplicationAttachmentRef }>(init.uploadUrl, {
          method: 'PUT',
          rawBody: file,
          contentType: resolvedMime,
          skipAuth: true,
        });
        setAttachments((prev) => [...prev, up.attachment]);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : `Upload failed for ${file.name}.`);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  };

  const buildSanitizedAnswersForTrack = () => {
    const out: Record<string, string> = { ...activeAnswers };
    if (track === 'security') {
      if (parseYesNo(out.security_allergies_has) !== 'Yes') {
        delete out.security_allergies_details;
      }
      if (parseYesNo(out.security_additional_info_has) !== 'Yes') {
        delete out.security_additional_info_details;
      }
    }
    return out;
  };

  const validateStep2General = (): boolean => {
    const errors = validateGeneralInfoFields(
      {
        applicant_name: applicantName,
        email,
        gender: gender || undefined,
        birth_date: track === 'security' ? undefined : birthDate,
        grade_or_year: gradeOrYear,
        institution,
        phone: combinedPhone,
        emergency_phone: emergencyContact,
        experience,
      },
      { strictV2: track !== 'security', track }
    );
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMsg(
        track === 'security'
          ? 'Please complete all required Personal Information and Experience fields (Items 1–7 and Division).'
          : 'Please complete all required General Information questions (Questions 1–10).'
      );
      return false;
    }
    setErrorMsg('');
    return true;
  };

  const validateStep3Department = (): boolean => {
    const sanitizedAnswers = buildSanitizedAnswersForTrack();
    const check = validateTeamIntakePayload({
      intake_version: 2,
      track,
      gender: (gender || 'male') as 'male' | 'female',
      applicant_name: applicantName,
      email,
      phone: combinedPhone,
      emergency_phone: emergencyContact,
      institution,
      grade_or_year: gradeOrYear,
      birth_date: track === 'security' ? undefined : birthDate,
      experience,
      portfolio_url: portfolioUrl || undefined,
      answers: sanitizedAnswers,
      privacy_policy_accepted: true,
      terms_accepted: true,
    });

    const deptErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(check.errors)) {
      if (
        k === 'portfolio_url' ||
        k === 'security_allergies_details' ||
        k === 'security_additional_info_details' ||
        activeQuestions.some((q) => q.id === k)
      ) {
        deptErrors[k] = v;
      }
    }
    setFieldErrors(deptErrors);
    if (Object.keys(deptErrors).length > 0) {
      setErrorMsg('Please review the highlighted department questions below before continuing.');
      return false;
    }
    setErrorMsg('');
    return true;
  };

  const goToStep = (target: WizardStep) => {
    setErrorMsg('');
    if (target <= step) {
      setFieldErrors({});
      setStep(target);
      scrollWizardIntoView();
      return;
    }
    if (step === 2 && target > 2 && !validateStep2General()) return;
    if (step === 3 && target > 3 && !validateStep3Department()) return;
    if (target === 4 && (!validateStep2General() || !validateStep3Department())) return;
    setStep(target);
    scrollWizardIntoView();
  };

  const submitFinalApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const sanitizedAnswers = buildSanitizedAnswersForTrack();
    const check = validateTeamIntakePayload({
      intake_version: 2,
      track,
      gender: (gender || undefined) as 'male' | 'female',
      applicant_name: applicantName,
      email,
      phone: combinedPhone,
      emergency_phone: emergencyContact,
      institution,
      grade_or_year: gradeOrYear,
      birth_date: track === 'security' ? undefined : birthDate,
      experience,
      portfolio_url: track === 'press' && portfolioUrl ? portfolioUrl : undefined,
      answers: sanitizedAnswers,
      privacy_policy_accepted: privacyAccepted,
      terms_accepted: termsAccepted,
    });
    if (!check.valid) {
      setFieldErrors(check.errors);
      setErrorMsg(Object.values(check.errors).join(' '));
      return;
    }

    const secAllergiesYes =
      track === 'security' && parseYesNo(sanitizedAnswers.security_allergies_has) === 'Yes';
    const secAllergiesDetail = secAllergiesYes
      ? String(sanitizedAnswers.security_allergies_details ?? '').trim()
      : '';

    setSubmitting(true);
    try {
      const res = await apiRequest<{ application_code: string }>(
        '/api/public/applications/team',
        {
          method: 'POST',
          skipAuth: true,
          body: {
            intake_version: 2,
            track,
            gender,
            applicant_name: applicantName.trim(),
            email: email.trim().toLowerCase(),
            phone: combinedPhone,
            emergency_phone: emergencyContact.trim(),
            institution: institution.trim(),
            grade_or_year: gradeOrYear,
            birth_date: track === 'security' ? undefined : birthDate,
            age:
              track === 'security'
                ? undefined
                : computeAgeFromBirthDate(birthDate) ?? 17,
            position: 'Team Member',
            experience: experience.trim(),
            portfolio_url: track === 'press' && portfolioUrl ? portfolioUrl.trim() : undefined,
            answers: {
              ...sanitizedAnswers,
              country_code: countryCode,
            },
            attachments,
            medical_has_conditions:
              track === 'media'
                ? Boolean(sanitizedAnswers.media_medical_concerns?.trim()) &&
                  !isNAValue(sanitizedAnswers.media_medical_concerns)
                : track === 'security'
                ? secAllergiesYes
                : medHas,
            medical_details:
              track === 'media'
                ? !isNAValue(sanitizedAnswers.media_medical_concerns)
                  ? sanitizedAnswers.media_medical_concerns?.trim() || ''
                  : ''
                : track === 'security'
                ? secAllergiesDetail
                : medDetails.trim(),
            privacy_policy_accepted: privacyAccepted,
            terms_accepted: termsAccepted,
            website: honeypot,
          },
        }
      );
      if (typeof window !== 'undefined') window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      const trackLabel = TRACK_CATALOG.find((t) => t.id === track)?.title ?? track;
      setSuccessReceipt({
        code: res.application_code,
        department: `${trackLabel} Department`,
        submittedAt: new Date().toLocaleString(),
      });
    } catch (err: unknown) {
      const details = (err as { details?: { errors?: Record<string, string> } })?.details;
      if (details?.errors) {
        setFieldErrors(details.errors);
        setErrorMsg(Object.values(details.errors).join(' '));
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const trackOpen = isTrackOpen(track);
  const computedAge = computeAgeFromBirthDate(birthDate);
  const mediaScheduleNeedsExplanation =
    track === 'media' &&
    (parseYesNo(activeAnswers.media_attend_conference) === 'No' ||
      parseYesNo(activeAnswers.media_attend_orientation) === 'No');

  const stepsMeta: Array<{ num: WizardStep; title: string }> = [
    { num: 1, title: 'Department' },
    {
      num: 2,
      title: track === 'security' ? 'Personal & Experience (1–8)' : 'General Info (Q1–Q10)',
    },
    { num: 3, title: `${TRACK_CATALOG.find((t) => t.id === track)?.title ?? track} Questions` },
    { num: 4, title: 'Review & Submit' },
  ];

  const securityWrittenQuestions =
    track === 'security' ? activeQuestions.slice(0, 3) : [];
  const securityAdditionalQuestions =
    track === 'security' ? activeQuestions.slice(3) : [];

  const renderQuestionCard = (q: IntakeQuestion, idx: number) => {
    const qNum = q.number ?? 11 + idx;
    const val = activeAnswers[q.id] ?? '';
    const wc = wordCount(val);
    const needsMediaScheduleExplanation =
      q.id === 'media_anything_else' && mediaScheduleNeedsExplanation;

    const detailFieldId =
      q.id === 'security_allergies_has'
        ? 'security_allergies_details'
        : q.id === 'security_additional_info_has'
        ? 'security_additional_info_details'
        : null;
    const detailVal = detailFieldId ? activeAnswers[detailFieldId] ?? '' : '';
    const showConditionalDetail = detailFieldId !== null && parseYesNo(val) === 'Yes';

    return (
      <div
        key={q.id}
        className={`border p-4 transition-colors sm:p-5 ${
          q.confidentialMedical
            ? 'border-[#83B5ED]/35 bg-[#040D1B]/95'
            : 'border-[#B89A62]/28 bg-[#040D1B]/90'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <label className="block font-sans text-sm font-semibold text-[#E8E1D2]">
            {qNum}. {q.label} <span className="text-[#83B5ED]">*</span>
          </label>
          {q.kind !== 'yes_no' && q.minWords > 1 && (
            <span
              className={`font-mono text-[11px] tabular-nums ${
                wc >= q.minWords ? 'text-[#86EFAC]' : 'text-[#D5BD8B]'
              }`}
            >
              {wc} / {q.minWords} min words
            </span>
          )}
        </div>

        {q.hint && <p className="mt-1 text-xs text-[#E8E1D2]/60">{q.hint}</p>}

        {needsMediaScheduleExplanation && (
          <p className="mt-2 border border-[#FCD34D]/45 bg-[#1B1406] px-3 py-2 text-xs text-[#FCD34D]">
            You indicated you may miss part of the conference or pre-MUN orientation. Please explain your scheduling details here.
          </p>
        )}

        {q.kind === 'yes_no' ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:max-w-xs">
              {(['Yes', 'No'] as const).map((opt) => {
                const selected = parseYesNo(val) === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => updateAnswer(q.id, opt)}
                    className={`border py-2.5 text-center font-sans text-xs font-semibold tracking-[0.06em] uppercase transition-all ${
                      selected
                        ? 'border-[#D5BD8B] bg-[#132949] text-[#F0DFB8] shadow-[0_0_16px_-6px_rgba(131,181,237,0.45)]'
                        : 'border-[#B89A62]/25 bg-[#030914] text-[#E8E1D2]/75 hover:border-[#83B5ED]/60 hover:text-[#E8E1D2]'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {showConditionalDetail && detailFieldId && (
              <div className="atlas-reveal-in mt-4 border-t border-[#B89A62]/20 pt-4">
                <label className="block font-mono text-[10px] tracking-[0.16em] text-[#83B5ED] uppercase">
                  {detailFieldId === 'security_allergies_details'
                    ? 'Please explain your allergies or accommodations *'
                    : 'Please share your inquiry or additional information *'}
                </label>
                <textarea
                  rows={3}
                  value={detailVal}
                  onChange={(e) => updateAnswer(detailFieldId, e.target.value)}
                  placeholder={
                    detailFieldId === 'security_allergies_details'
                      ? 'List any food, environmental, or medication allergies we should know about...'
                      : 'Enter your question or any additional details for the Security Directorate...'
                  }
                  className={LUXURY_INPUT_CLS}
                />
                {fieldErrors[detailFieldId] && (
                  <p className="mt-1.5 text-xs text-[#FCA5A5]">{fieldErrors[detailFieldId]}</p>
                )}
              </div>
            )}
          </>
        ) : (
          <textarea
            rows={q.minWords >= 40 ? 4 : 3}
            value={val}
            onChange={(e) => updateAnswer(q.id, e.target.value)}
            placeholder={q.placeholder}
            className={LUXURY_INPUT_CLS}
          />
        )}

        {fieldErrors[q.id] && (
          <p className="mt-1.5 text-xs text-[#FCA5A5]">{fieldErrors[q.id]}</p>
        )}
      </div>
    );
  };

  return (
    <div
      ref={wizardRef}
      className={
        embedded
          ? 'scroll-mt-24 text-[#E8E1D2]'
          : 'relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_75%_45%_at_50%_0%,rgba(131,181,237,0.12),transparent_65%)] bg-[#030914] px-4 py-8 text-[#E8E1D2] sm:px-6 md:px-10 md:py-12'
      }
    >
      {!embedded && <GoldParticlesCanvas count={20} className="z-0 opacity-70" />}

      <div className="relative z-10 mx-auto max-w-4xl">
        {/* Header */}
        {embedded ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rotate-45 bg-[#7F1D26] ring-1 ring-[#D5BD8B]" aria-hidden="true" />
              <span className="font-mono text-[11px] tracking-[0.18em] text-[#D5BD8B] uppercase">
                Team Member Application Desk
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {!successReceipt && (
                <button
                  type="button"
                  onClick={clearSavedDraft}
                  className="inline-flex items-center gap-1.5 border border-[#B89A62]/30 bg-[#071426] px-3.5 py-2 font-sans text-xs font-medium text-[#E8E1D2]/80 transition-colors hover:border-[#D5BD8B] hover:text-[#E8E1D2]"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#D5BD8B]" />
                  <span>Reset Form</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/staff-login')}
                className="border border-[#B89A62]/35 bg-[#071426] px-4 py-2 font-sans text-xs font-semibold tracking-[0.08em] text-[#83B5ED] uppercase transition-colors hover:border-[#D5BD8B] hover:text-[#D5BD8B]"
              >
                Staff Portal
              </button>
            </div>
          </div>
        ) : (
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#B89A62]/30 pb-6">
            <div>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 font-sans text-xs font-medium tracking-[0.12em] text-[#83B5ED] uppercase transition-colors hover:text-[#D5BD8B]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Living Atlas</span>
              </button>
              <div className="mt-3 flex items-center gap-3">
                <LaurelWreathAccent size={42} />
                <span className="font-mono text-[10px] tracking-[0.22em] text-[#B89A62] uppercase">
                  Leadership International School MUN · Session I
                </span>
              </div>
              <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-[#E8E1D2] sm:text-5xl">
                LIS MUN Team Member Applications
              </h1>
              <p className="mt-1.5 max-w-2xl font-sans text-sm text-[#E8E1D2]/75">
                Apply to join one of the four conference departments (Media, Volunteers, Press, or Security).
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              {!successReceipt && (
                <button
                  type="button"
                  onClick={clearSavedDraft}
                  className="inline-flex items-center gap-1.5 border border-[#B89A62]/30 bg-[#071426] px-3.5 py-2 font-sans text-xs font-medium text-[#E8E1D2]/80 transition-colors hover:border-[#D5BD8B] hover:text-[#E8E1D2]"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#D5BD8B]" />
                  <span>Reset Form</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/staff-login')}
                className="border border-[#B89A62]/35 bg-[#071426] px-4 py-2 font-sans text-xs font-semibold tracking-[0.08em] text-[#83B5ED] uppercase transition-colors hover:border-[#D5BD8B] hover:text-[#D5BD8B]"
              >
                Staff Portal
              </button>
            </div>
          </header>
        )}

        {/* Submission Confirmation Receipt */}
        {successReceipt ? (
          <section className="atlas-luxury-card mt-8 p-7 sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 text-[#86EFAC]">
                  <Check className="h-5 w-5" />
                  <p className="font-mono text-xs tracking-[0.16em] uppercase">
                    Application Confirmed &amp; Recorded
                  </p>
                </div>
                <h2 className="mt-3 font-display text-3xl font-semibold text-[#E8E1D2] sm:text-4xl">
                  Reference Code:{' '}
                  <span className="font-mono text-2xl tabular-nums text-[#D5BD8B] sm:text-3xl">
                    {successReceipt.code}
                  </span>
                </h2>
              </div>
              <DiplomaticWaxSeal size={64} label="FILED" />
            </div>
            <dl className="mt-6 grid gap-4 border-y border-[#B89A62]/25 py-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="font-mono text-[10px] tracking-[0.14em] text-[#83B5ED] uppercase">
                  Applicant
                </dt>
                <dd className="mt-1 font-medium text-[#E8E1D2]">{applicantName || 'Recorded'}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.14em] text-[#83B5ED] uppercase">
                  Department / Track
                </dt>
                <dd className="mt-1 font-medium text-[#E8E1D2]">{successReceipt.department}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.14em] text-[#83B5ED] uppercase">
                  Submitted
                </dt>
                <dd className="mt-1 font-mono text-[#E8E1D2]/80">{successReceipt.submittedAt}</dd>
              </div>
            </dl>
            <p className="mt-4 font-sans text-sm leading-relaxed text-[#E8E1D2]/78">
              Please keep your reference code for your records. Your responses and uploaded certificates have been routed directly to the LIS MUN Secretariat and relevant Department Directorate.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setSuccessReceipt(null);
                  clearSavedDraft();
                }}
                className="atlas-btn-gold bg-[#0D1E36] px-5 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#E8E1D2] uppercase"
              >
                Start New Application
              </button>
              <button
                type="button"
                onClick={() =>
                  embedded
                    ? window.scrollTo({ top: 0, behavior: 'smooth' })
                    : navigate('/')
                }
                className="border border-[#B89A62]/30 bg-[#040D1B] px-5 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#E8E1D2]/80 uppercase transition-colors hover:border-[#83B5ED]/60 hover:text-[#E8E1D2]"
              >
                {embedded ? 'Back to Top' : 'Return to Atlas'}
              </button>
            </div>
          </section>
        ) : (
          <div className="atlas-luxury-card mt-7 p-5 sm:p-8">
            {/* Stepper Progress Indicator */}
            <nav aria-label="Application steps" className="mb-7 border-b border-[#B89A62]/20 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                <span className="font-mono text-[11px] tracking-[0.14em] text-[#83B5ED] uppercase">
                  {TRACK_CATALOG.find((t) => t.id === track)?.title} Team Member Application
                </span>
                <span className="font-mono text-[11px] text-[#B89A62]/80">
                  Progress auto-saved locally
                </span>
              </div>
              <ol className="grid gap-2 sm:grid-cols-4">
                {stepsMeta.map((s, idx) => {
                  const isCurrent = step === s.num;
                  const isDone = step > s.num;
                  return (
                    <li key={s.num}>
                      <button
                        type="button"
                        onClick={() => goToStep(s.num)}
                        className={`flex w-full items-center gap-2.5 border px-3 py-2.5 text-left transition-all ${
                          isCurrent
                            ? 'border-[#D5BD8B] bg-[#122847] text-[#F0DFB8] shadow-[0_0_16px_-8px_rgba(131,181,237,0.45)]'
                            : isDone
                            ? 'border-[#83B5ED]/45 bg-[#071426] text-[#B3D5FF]'
                            : 'border-[#B89A62]/20 bg-[#040D1B]/75 text-[#E8E1D2]/60 hover:border-[#B89A62]/45 hover:text-[#E8E1D2]'
                        }`}
                      >
                        <span className="font-mono text-[11px] font-semibold tabular-nums text-[#D5BD8B]">
                          0{idx + 1}
                        </span>
                        <span className="truncate font-sans text-xs font-medium">{s.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            {errorMsg && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-2.5 border border-[#EF4444]/60 bg-[#250D12] p-3.5 text-xs text-[#FCA5A5]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={submitFinalApplication} noValidate className="space-y-6">
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
              />

              {/* STEP 1: DEPARTMENT SELECTION */}
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-[#E8E1D2] sm:text-3xl">
                      Select Your Department
                    </h2>
                    <p className="mt-1 text-xs text-[#E8E1D2]/75">
                      Choose a department below. Security features a streamlined Personal &amp; Experience profile followed by Security protocol scenarios; Media, Volunteers, and Press use the 10-question general profile.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {TRACK_CATALOG.map((item) => {
                      const open = isTrackOpen(item.id);
                      const selected = track === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setTrack(item.id);
                            setErrorMsg('');
                            setFieldErrors({});
                          }}
                          className={`flex flex-col justify-between border p-4 text-left transition-all ${
                            selected
                              ? 'border-[#D5BD8B] bg-[radial-gradient(circle_at_90%_10%,rgba(131,181,237,0.14),transparent_60%)] bg-[#102440] shadow-[0_12px_28px_-16px_rgba(131,181,237,0.45)]'
                              : 'border-[#B89A62]/25 bg-[#040D1B]/85 hover:border-[#D5BD8B]/60'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display text-2xl font-semibold text-[#E8E1D2]">
                                {item.title}
                              </span>
                              <StatusLabel status={open ? 'Open' : 'Closed'} tone={open ? 'green' : 'red'} />
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-[#E8E1D2]/75">
                              {item.tagline}
                            </p>
                          </div>
                          <p className="mt-3 font-mono text-[10px] tracking-[0.12em] text-[#83B5ED] uppercase">
                            {item.summaryLabel}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {!trackOpen && (
                    <div className="border border-[#EF4444]/50 bg-[#250D12] p-5 text-center">
                      <p className="font-display text-xl text-[#FCA5A5]">
                        {TRACK_CATALOG.find((t) => t.id === track)?.title} Applications Paused
                      </p>
                      <p className="mt-1 text-xs text-[#E8E1D2]/75">
                        This division is currently closed by the Secretariat. Select another open department to apply.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end border-t border-[#B89A62]/20 pt-5">
                    <button
                      type="button"
                      disabled={!trackOpen}
                      onClick={() => {
                        setStep(2);
                        scrollWizardIntoView();
                      }}
                      className="atlas-btn-gold inline-flex items-center gap-2 bg-[#0D1E36] px-6 py-2.5 font-sans text-xs font-semibold tracking-[0.1em] text-[#E8E1D2] uppercase disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>
                        {track === 'security'
                          ? 'Continue to Personal Information'
                          : 'Continue to General Information'}
                      </span>
                      <ArrowRight className="atlas-btn-arrow h-3.5 w-3.5 text-[#D5BD8B]" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: SECURITY PERSONAL INFO (1-6) & EXPERIENCE (7-8) OR STANDARD Q1-Q10 */}
              {step === 2 && track === 'security' && (
                <div className="space-y-6">
                  <div className="border-b border-[#B89A62]/25 pb-4">
                    <p className="font-mono text-[10px] tracking-[0.16em] text-[#83B5ED] uppercase">
                      Section 1 · Security Personal Information (1–6)
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-semibold text-[#E8E1D2] sm:text-3xl">
                      Security Applicant Profile &amp; Experience
                    </h2>
                  </div>

                  {!trackOpen && (
                    <div className="border border-[#EF4444]/50 bg-[#250D12] p-4 text-xs text-[#FCA5A5]">
                      Applications for Security are currently paused by the Secretariat.
                    </div>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    {/* 1. Full Name */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        1. Full Name <span className="text-[#83B5ED]">*</span>
                      </label>
                      <input
                        type="text"
                        value={applicantName}
                        onChange={(e) => {
                          setApplicantName(e.target.value);
                          if (fieldErrors.applicant_name) {
                            setFieldErrors((p) => ({ ...p, applicant_name: '' }));
                          }
                        }}
                        placeholder="First Middle Last"
                        className={LUXURY_INPUT_CLS}
                      />
                      {fieldErrors.applicant_name && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.applicant_name}</p>
                      )}
                    </div>

                    {/* 2. Email Address */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        2. Email Address <span className="text-[#83B5ED]">*</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) {
                            setFieldErrors((p) => ({ ...p, email: '' }));
                          }
                        }}
                        placeholder="applicant@example.com"
                        className={LUXURY_INPUT_CLS}
                      />
                      {fieldErrors.email && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.email}</p>
                      )}
                    </div>

                    {/* 3. Grade */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        3. Grade <span className="text-[#83B5ED]">*</span>
                      </label>
                      <select
                        value={gradeOrYear}
                        onChange={(e) => {
                          setGradeOrYear(e.target.value);
                          if (fieldErrors.grade_or_year) {
                            setFieldErrors((p) => ({ ...p, grade_or_year: '' }));
                          }
                        }}
                        className={LUXURY_INPUT_CLS}
                      >
                        <option value="">Select your current grade...</option>
                        {GRADE_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.grade_or_year && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.grade_or_year}</p>
                      )}
                    </div>

                    {/* 4. School */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        4. School <span className="text-[#83B5ED]">*</span>
                      </label>
                      <input
                        type="text"
                        value={institution}
                        onChange={(e) => {
                          setInstitution(e.target.value);
                          if (fieldErrors.institution) {
                            setFieldErrors((p) => ({ ...p, institution: '' }));
                          }
                        }}
                        placeholder="Full school name (no abbreviations)"
                        className={LUXURY_INPUT_CLS}
                      />
                      <p className="mt-1 text-[11px] font-medium text-[#83B5ED]">
                        Do not use abbreviations (e.g. write Leadership International School, not LIS).
                      </p>
                      {fieldErrors.institution && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.institution}</p>
                      )}
                    </div>

                    {/* 5. Phone Number */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        5. Phone Number <span className="text-[#83B5ED]">*</span>
                      </label>
                      <div className="mt-1.5 flex gap-2">
                        <select
                          aria-label="Country dial code"
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                          className="w-40 shrink-0 border border-[#B89A62]/30 bg-[#040D1B] px-2.5 py-2.5 font-mono text-xs text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
                        >
                          {COUNTRY_DIAL_CODES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          value={phoneLocal}
                          onChange={(e) => {
                            setPhoneLocal(e.target.value);
                            if (fieldErrors.phone) {
                              setFieldErrors((p) => ({ ...p, phone: '' }));
                            }
                          }}
                          placeholder={countryCode === 'INTL' ? '+XX XXX XXX XXXX' : '5X XXX XXXX'}
                          className="w-full border border-[#B89A62]/30 bg-[#040D1B] px-3 py-2.5 font-mono text-sm text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
                        />
                      </div>
                      {combinedPhone && (
                        <p className="mt-1 font-mono text-[10px] text-[#E8E1D2]/55">
                          Formatted: {combinedPhone}
                        </p>
                      )}
                      {fieldErrors.phone && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.phone}</p>
                      )}
                    </div>

                    {/* 6. Guardian's Phone Number */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        6. Guardian&apos;s Phone Number <span className="text-[#83B5ED]">*</span>
                      </label>
                      <input
                        type="tel"
                        value={emergencyContact}
                        onChange={(e) => {
                          setEmergencyContact(e.target.value);
                          if (fieldErrors.emergency_phone) {
                            setFieldErrors((p) => ({ ...p, emergency_phone: '' }));
                          }
                        }}
                        placeholder="+966 5X XXX XXXX (Parent / Guardian)"
                        className={`${LUXURY_INPUT_CLS} font-mono`}
                      />
                      <p className="mt-1 text-[11px] text-[#E8E1D2]/55">
                        Parent or legal guardian emergency contact phone number.
                      </p>
                      {fieldErrors.emergency_phone && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.emergency_phone}</p>
                      )}
                    </div>

                    {/* Division Routing for Boys / Girls Security Heads */}
                    <div className="sm:col-span-2">
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        Security Division Assignment <span className="text-[#83B5ED]">*</span>
                      </label>
                      <p className="mt-0.5 text-[11px] text-[#E8E1D2]/55">
                        Routes your Security dossier to the corresponding Female (Girls) or Male (Boys) Section Head.
                      </p>
                      <div className="mt-2 grid max-w-md grid-cols-2 gap-2.5">
                        {[
                          { val: 'female' as const, label: 'Female' },
                          { val: 'male' as const, label: 'Male' },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            aria-pressed={gender === opt.val}
                            onClick={() => {
                              setGender(opt.val);
                              if (fieldErrors.gender) {
                                setFieldErrors((p) => ({ ...p, gender: '' }));
                              }
                            }}
                            className={`border py-2.5 text-center font-sans text-sm font-medium transition-all ${
                              gender === opt.val
                                ? 'border-[#D5BD8B] bg-[#122847] text-[#F0DFB8]'
                                : 'border-[#B89A62]/25 bg-[#040D1B] text-[#E8E1D2]/75 hover:border-[#83B5ED]/60'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {fieldErrors.gender && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.gender}</p>
                      )}
                    </div>
                  </div>

                  {/* Section 2: Experience (7–8) */}
                  <div className="border-t border-[#B89A62]/25 pt-5">
                    <p className="font-mono text-[10px] tracking-[0.16em] text-[#83B5ED] uppercase">
                      Section 2 · Experience (7–8)
                    </p>
                  </div>

                  {/* 7. Previous Experience */}
                  <div>
                    <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                      7. Previous Experience <span className="text-[#83B5ED]">*</span>
                    </label>
                    <textarea
                      rows={4}
                      value={experience}
                      onChange={(e) => {
                        setExperience(e.target.value);
                        if (fieldErrors.experience) {
                          setFieldErrors((p) => ({ ...p, experience: '' }));
                        }
                      }}
                      placeholder="List prior MUN security, event management, discipline, scouting, or leadership experience (or enter None if first time)..."
                      className={LUXURY_INPUT_CLS}
                    />
                    {fieldErrors.experience && (
                      <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.experience}</p>
                    )}
                  </div>

                  {/* 8. Upload Proof of Experience */}
                  <div className="border border-[#B89A62]/30 bg-[#040D1B]/95 p-4 sm:p-5">
                    <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                      8. Upload Proof of Experience
                    </label>
                    <p className="mt-1 text-xs text-[#E8E1D2]/60">
                      Upload certificates, letters, or verification documents if available. Accepted formats: PDF, JPG, JPEG, and PNG (max 15 MB per file).
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 border border-[#D5BD8B]/45 bg-[#102440] px-4 py-2 font-sans text-xs font-semibold text-[#F0DFB8] transition-colors hover:border-[#D5BD8B] hover:bg-[#173258]">
                        <Upload className="h-3.5 w-3.5 text-[#83B5ED]" />
                        <span>
                          {uploadingCount > 0
                            ? `Uploading (${uploadingCount})...`
                            : 'Select Proof of Experience Files'}
                        </span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          disabled={uploadingCount > 0}
                          onChange={(e) => {
                            void handleFilesSelected(e.target.files);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      <span className="font-mono text-[11px] text-[#83B5ED]">
                        {attachments.length} file{attachments.length === 1 ? '' : 's'} attached
                      </span>
                    </div>

                    {attachments.length > 0 && (
                      <ul className="mt-4 divide-y divide-[#B89A62]/15 border border-[#B89A62]/25 bg-[#030914]">
                        {attachments.map((att) => (
                          <li
                            key={att.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <FileText className="h-4 w-4 shrink-0 text-[#D5BD8B]" />
                              <span className="truncate font-medium text-[#E8E1D2]">
                                {att.file_name}
                              </span>
                              <span className="font-mono text-[10px] text-[#83B5ED]">
                                {formatBytes(att.size_bytes)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setAttachments((prev) => prev.filter((x) => x.id !== att.id))
                              }
                              aria-label={`Remove ${att.file_name}`}
                              className="inline-flex items-center gap-1 text-[11px] text-[#FCA5A5] hover:text-white"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Remove</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#B89A62]/20 pt-5">
                    <button
                      type="button"
                      onClick={() => goToStep(1)}
                      className="inline-flex items-center gap-2 border border-[#B89A62]/30 bg-[#040D1B] px-4 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#E8E1D2]/80 uppercase hover:border-[#83B5ED]/60 hover:text-white"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back to Department</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (validateStep2General()) {
                          setStep(3);
                          scrollWizardIntoView();
                        }
                      }}
                      className="atlas-btn-gold inline-flex items-center gap-2 bg-[#0D1E36] px-6 py-2.5 font-sans text-xs font-semibold tracking-[0.1em] text-[#E8E1D2] uppercase"
                    >
                      <span>Continue to Security Questions</span>
                      <ArrowRight className="atlas-btn-arrow h-3.5 w-3.5 text-[#D5BD8B]" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2 FOR MEDIA / VOLUNTEERS / PRESS: SHARED GENERAL INFORMATION (QUESTIONS 1–10) */}
              {step === 2 && track !== 'security' && (
                <div className="space-y-6">
                  <div className="border-b border-[#B89A62]/25 pb-4">
                    <p className="font-mono text-[10px] tracking-[0.16em] text-[#83B5ED] uppercase">
                      Section 1 · Required for All Departments
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-semibold text-[#E8E1D2] sm:text-3xl">
                      General Applicant Information (Questions 1–10)
                    </h2>
                  </div>

                  {!trackOpen && (
                    <div className="border border-[#EF4444]/50 bg-[#250D12] p-4 text-xs text-[#FCA5A5]">
                      Applications for this track are currently paused by the Secretariat.
                    </div>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    {/* Q1 */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        1. What is your full name? <span className="text-[#83B5ED]">*</span>
                      </label>
                      <input
                        type="text"
                        value={applicantName}
                        onChange={(e) => {
                          setApplicantName(e.target.value);
                          if (fieldErrors.applicant_name) {
                            setFieldErrors((p) => ({ ...p, applicant_name: '' }));
                          }
                        }}
                        placeholder="First Middle Last"
                        className={LUXURY_INPUT_CLS}
                      />
                      {fieldErrors.applicant_name && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.applicant_name}</p>
                      )}
                    </div>

                    {/* Q2 */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        2. What is your email? <span className="text-[#83B5ED]">*</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) {
                            setFieldErrors((p) => ({ ...p, email: '' }));
                          }
                        }}
                        placeholder="applicant@example.com"
                        className={LUXURY_INPUT_CLS}
                      />
                      {fieldErrors.email && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.email}</p>
                      )}
                    </div>

                    {/* Q3 */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        3. What is your gender? <span className="text-[#83B5ED]">*</span>
                      </label>
                      <div className="mt-1.5 grid grid-cols-2 gap-2.5">
                        {[
                          { val: 'female' as const, label: 'Female' },
                          { val: 'male' as const, label: 'Male' },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => {
                              setGender(opt.val);
                              if (fieldErrors.gender) {
                                setFieldErrors((p) => ({ ...p, gender: '' }));
                              }
                            }}
                            className={`border py-2.5 text-center font-sans text-sm font-medium transition-all ${
                              gender === opt.val
                                ? 'border-[#D5BD8B] bg-[#122847] text-[#F0DFB8]'
                                : 'border-[#B89A62]/25 bg-[#040D1B] text-[#E8E1D2]/75 hover:border-[#83B5ED]/60'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {fieldErrors.gender && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.gender}</p>
                      )}
                    </div>

                    {/* Q4 */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                          4. When is your birth date? <span className="text-[#83B5ED]">*</span>
                        </label>
                        {computedAge !== null && (
                          <span className="font-mono text-[11px] tabular-nums text-[#83B5ED]">
                            Age {computedAge}
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        max={todayIso}
                        value={birthDate}
                        onChange={(e) => {
                          setBirthDate(e.target.value);
                          if (fieldErrors.birth_date) {
                            setFieldErrors((p) => ({ ...p, birth_date: '' }));
                          }
                        }}
                        className={`${LUXURY_INPUT_CLS} font-mono`}
                      />
                      {fieldErrors.birth_date && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.birth_date}</p>
                      )}
                    </div>

                    {/* Q5 */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        5. What grade are you? <span className="text-[#83B5ED]">*</span>
                      </label>
                      <select
                        value={gradeOrYear}
                        onChange={(e) => {
                          setGradeOrYear(e.target.value);
                          if (fieldErrors.grade_or_year) {
                            setFieldErrors((p) => ({ ...p, grade_or_year: '' }));
                          }
                        }}
                        className={LUXURY_INPUT_CLS}
                      >
                        <option value="">Select your current grade...</option>
                        {GRADE_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.grade_or_year && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.grade_or_year}</p>
                      )}
                    </div>

                    {/* Q6 */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        6. What school are you in? <span className="text-[#83B5ED]">*</span>
                      </label>
                      <input
                        type="text"
                        value={institution}
                        onChange={(e) => {
                          setInstitution(e.target.value);
                          if (fieldErrors.institution) {
                            setFieldErrors((p) => ({ ...p, institution: '' }));
                          }
                        }}
                        placeholder="Full school name (no abbreviations)"
                        className={LUXURY_INPUT_CLS}
                      />
                      <p className="mt-1 text-[11px] font-medium text-[#83B5ED]">
                        Do not use abbreviations (e.g. write Leadership International School, not LIS).
                      </p>
                      {fieldErrors.institution && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.institution}</p>
                      )}
                    </div>

                    {/* Q7 */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        7. What is your phone number? <span className="text-[#83B5ED]">*</span>
                      </label>
                      <div className="mt-1.5 flex gap-2">
                        <select
                          aria-label="Country dial code"
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                          className="w-40 shrink-0 border border-[#B89A62]/30 bg-[#040D1B] px-2.5 py-2.5 font-mono text-xs text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
                        >
                          {COUNTRY_DIAL_CODES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          value={phoneLocal}
                          onChange={(e) => {
                            setPhoneLocal(e.target.value);
                            if (fieldErrors.phone) {
                              setFieldErrors((p) => ({ ...p, phone: '' }));
                            }
                          }}
                          placeholder={countryCode === 'INTL' ? '+XX XXX XXX XXXX' : '5X XXX XXXX'}
                          className="w-full border border-[#B89A62]/30 bg-[#040D1B] px-3 py-2.5 font-mono text-sm text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
                        />
                      </div>
                      {combinedPhone && (
                        <p className="mt-1 font-mono text-[10px] text-[#E8E1D2]/55">
                          Formatted: {combinedPhone}
                        </p>
                      )}
                      {fieldErrors.phone && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.phone}</p>
                      )}
                    </div>

                    {/* Q8 */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                        8. Please enter an emergency contact. <span className="text-[#83B5ED]">*</span>
                      </label>
                      <input
                        type="text"
                        value={emergencyContact}
                        onChange={(e) => {
                          setEmergencyContact(e.target.value);
                          if (fieldErrors.emergency_phone) {
                            setFieldErrors((p) => ({ ...p, emergency_phone: '' }));
                          }
                        }}
                        placeholder="Name, relationship, and phone number"
                        className={LUXURY_INPUT_CLS}
                      />
                      {fieldErrors.emergency_phone && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.emergency_phone}</p>
                      )}
                    </div>
                  </div>

                  {/* Q9 */}
                  <div>
                    <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                      9. Please list your previous experiences. <span className="text-[#83B5ED]">*</span>
                    </label>
                    <textarea
                      rows={4}
                      value={experience}
                      onChange={(e) => {
                        setExperience(e.target.value);
                        if (fieldErrors.experience) {
                          setFieldErrors((p) => ({ ...p, experience: '' }));
                        }
                      }}
                      placeholder="List previous MUN conferences, school clubs, volunteer roles, or leadership positions (or write None if this is your first time)..."
                      className={LUXURY_INPUT_CLS}
                    />
                    {fieldErrors.experience && (
                      <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.experience}</p>
                    )}
                  </div>

                  {/* Q10 */}
                  <div className="border border-[#B89A62]/30 bg-[#040D1B]/95 p-4 sm:p-5">
                    <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                      10. Please attach certificates for your experiences.
                    </label>
                    <p className="mt-1 text-xs text-[#E8E1D2]/60">
                      Multiple files supported. Accepted formats: PDF, JPG, JPEG, and PNG (max 15 MB per file).
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 border border-[#D5BD8B]/45 bg-[#102440] px-4 py-2 font-sans text-xs font-semibold text-[#F0DFB8] transition-colors hover:border-[#D5BD8B] hover:bg-[#173258]">
                        <Upload className="h-3.5 w-3.5 text-[#83B5ED]" />
                        <span>
                          {uploadingCount > 0
                            ? `Uploading (${uploadingCount})...`
                            : 'Select Certificate Files'}
                        </span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          disabled={uploadingCount > 0}
                          onChange={(e) => {
                            void handleFilesSelected(e.target.files);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      <span className="font-mono text-[11px] text-[#83B5ED]">
                        {attachments.length} file{attachments.length === 1 ? '' : 's'} attached
                      </span>
                    </div>

                    {attachments.length > 0 && (
                      <ul className="mt-4 divide-y divide-[#B89A62]/15 border border-[#B89A62]/25 bg-[#030914]">
                        {attachments.map((att) => (
                          <li
                            key={att.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <FileText className="h-4 w-4 shrink-0 text-[#D5BD8B]" />
                              <span className="truncate font-medium text-[#E8E1D2]">
                                {att.file_name}
                              </span>
                              <span className="font-mono text-[10px] text-[#83B5ED]">
                                {formatBytes(att.size_bytes)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setAttachments((prev) => prev.filter((x) => x.id !== att.id))
                              }
                              aria-label={`Remove ${att.file_name}`}
                              className="inline-flex items-center gap-1 text-[11px] text-[#FCA5A5] hover:text-white"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Remove</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#B89A62]/20 pt-5">
                    <button
                      type="button"
                      onClick={() => goToStep(1)}
                      className="inline-flex items-center gap-2 border border-[#B89A62]/30 bg-[#040D1B] px-4 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#E8E1D2]/80 uppercase hover:border-[#83B5ED]/60 hover:text-white"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back to Department</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (validateStep2General()) {
                          setStep(3);
                          scrollWizardIntoView();
                        }
                      }}
                      className="atlas-btn-gold inline-flex items-center gap-2 bg-[#0D1E36] px-6 py-2.5 font-sans text-xs font-semibold tracking-[0.1em] text-[#E8E1D2] uppercase"
                    >
                      <span>Continue to Department Questions</span>
                      <ArrowRight className="atlas-btn-arrow h-3.5 w-3.5 text-[#D5BD8B]" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: STRICTLY DEPARTMENT-ISOLATED QUESTIONS */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="border-b border-[#B89A62]/25 pb-4">
                    <p className="font-mono text-[10px] tracking-[0.16em] text-[#83B5ED] uppercase">
                      {track === 'security'
                        ? 'Section 3 & 4 · Written & Additional Questions'
                        : 'Section 2 · Department-Specific Application'}
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-semibold text-[#E8E1D2] sm:text-3xl">
                      {TRACK_CATALOG.find((t) => t.id === track)?.title} Team Member Questions
                    </h2>
                  </div>

                  {track === 'security' ? (
                    <div className="space-y-7">
                      <div className="space-y-4">
                        <p className="font-mono text-[10px] tracking-[0.18em] text-[#D5BD8B] uppercase">
                          Written Questions (9–11)
                        </p>
                        <div className="space-y-5">
                          {securityWrittenQuestions.map((q, idx) => renderQuestionCard(q, idx))}
                        </div>
                      </div>

                      <div className="space-y-4 border-t border-[#B89A62]/25 pt-6">
                        <p className="font-mono text-[10px] tracking-[0.18em] text-[#83B5ED] uppercase">
                          Additional Questions (12–13)
                        </p>
                        <div className="space-y-5">
                          {securityAdditionalQuestions.map((q, idx) =>
                            renderQuestionCard(q, 3 + idx)
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {track === 'press' && (
                        <div>
                          <label className="block font-sans text-xs font-semibold text-[#E8E1D2]">
                            Writing Portfolio / Published Clips URL (Optional)
                          </label>
                          <input
                            type="url"
                            value={portfolioUrl}
                            onChange={(e) => setPortfolioUrl(e.target.value)}
                            placeholder="https://portfolio.example.com"
                            className={LUXURY_INPUT_CLS}
                          />
                          {fieldErrors.portfolio_url && (
                            <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.portfolio_url}</p>
                          )}
                        </div>
                      )}

                      {activeQuestions.map((q, idx) => renderQuestionCard(q, idx))}

                      {/* Admin-Only Confidential Medical Disclosure for Volunteers & Press (Media has Q17, Security has Q12) */}
                      {track !== 'media' && (
                        <div className="border border-[#B89A62]/25 bg-[#040D1B]/90 p-4">
                          <div className="flex items-center gap-2 text-[#83B5ED]">
                            <ShieldCheck className="h-4 w-4" />
                            <span className="font-mono text-[10px] tracking-[0.14em] uppercase">
                              Confidential Medical Disclosure (Optional · Admin-Only Access)
                            </span>
                          </div>
                          <label className="mt-3 flex items-center gap-2.5 text-xs text-[#E8E1D2]/80">
                            <input
                              type="checkbox"
                              checked={medHas}
                              onChange={(e) => setMedHas(e.target.checked)}
                            />
                            <span>
                              I have medical conditions, allergies, or emergency accommodations to disclose.
                            </span>
                          </label>
                          {medHas && (
                            <textarea
                              rows={2}
                              value={medDetails}
                              onChange={(e) => setMedDetails(e.target.value)}
                              placeholder="Provide confidential details (never shown to Department Heads or HR)..."
                              className={LUXURY_INPUT_CLS}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#B89A62]/20 pt-5">
                    <button
                      type="button"
                      onClick={() => goToStep(2)}
                      className="inline-flex items-center gap-2 border border-[#B89A62]/30 bg-[#040D1B] px-4 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#E8E1D2]/80 uppercase hover:border-[#83B5ED]/60 hover:text-white"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>
                        {track === 'security' ? 'Back to Personal Info' : 'Back to General Info'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (validateStep3Department()) {
                          setStep(4);
                          scrollWizardIntoView();
                        }
                      }}
                      className="atlas-btn-gold inline-flex items-center gap-2 bg-[#0D1E36] px-6 py-2.5 font-sans text-xs font-semibold tracking-[0.1em] text-[#E8E1D2] uppercase"
                    >
                      <span>Review Application</span>
                      <ArrowRight className="atlas-btn-arrow h-3.5 w-3.5 text-[#D5BD8B]" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: REVIEW & FINAL CONSENT SUBMISSION */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="border-b border-[#B89A62]/25 pb-4">
                    <p className="font-mono text-[10px] tracking-[0.16em] text-[#83B5ED] uppercase">
                      Final Verification · Diplomatic Registry
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-semibold text-[#E8E1D2] sm:text-3xl">
                      Review Your Application
                    </h2>
                  </div>

                  {/* General / Personal Information Review */}
                  <div className="border border-[#B89A62]/28 bg-[#040D1B]/95 p-5">
                    <div className="flex items-center justify-between gap-2 border-b border-[#B89A62]/20 pb-3">
                      <h3 className="font-sans text-xs font-semibold tracking-[0.1em] text-[#D5BD8B] uppercase">
                        {track === 'security'
                          ? 'Personal Information & Experience (1–8)'
                          : 'General Information (Questions 1–10)'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => goToStep(2)}
                        className="text-xs font-medium text-[#83B5ED] underline hover:text-[#D5BD8B]"
                      >
                        Edit
                      </button>
                    </div>
                    <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-[#E8E1D2]/55">1. Full Name</dt>
                        <dd className="mt-0.5 font-medium text-[#E8E1D2]">{applicantName}</dd>
                      </div>
                      <div>
                        <dt className="text-[#E8E1D2]/55">2. Email Address</dt>
                        <dd className="mt-0.5 font-medium text-[#E8E1D2]">{email}</dd>
                      </div>
                      {track === 'security' ? (
                        <>
                          <div>
                            <dt className="text-[#E8E1D2]/55">3. Grade</dt>
                            <dd className="mt-0.5 font-medium text-[#E8E1D2]">{gradeOrYear}</dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">4. School</dt>
                            <dd className="mt-0.5 font-medium text-[#E8E1D2]">{institution}</dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">5. Phone Number</dt>
                            <dd className="mt-0.5 font-mono text-[#E8E1D2]">{combinedPhone}</dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">6. Guardian&apos;s Phone Number</dt>
                            <dd className="mt-0.5 font-mono text-[#E8E1D2]">{emergencyContact}</dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">Security Division</dt>
                            <dd className="mt-0.5 font-medium capitalize text-[#E8E1D2]">{gender}</dd>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <dt className="text-[#E8E1D2]/55">3. Gender</dt>
                            <dd className="mt-0.5 font-medium capitalize text-[#E8E1D2]">{gender}</dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">4. Birth Date</dt>
                            <dd className="mt-0.5 font-mono text-[#E8E1D2]">
                              {birthDate} {computedAge !== null ? `(Age ${computedAge})` : ''}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">5. Grade</dt>
                            <dd className="mt-0.5 font-medium text-[#E8E1D2]">{gradeOrYear}</dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">6. School</dt>
                            <dd className="mt-0.5 font-medium text-[#E8E1D2]">{institution}</dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">7. Phone Number</dt>
                            <dd className="mt-0.5 font-mono text-[#E8E1D2]">{combinedPhone}</dd>
                          </div>
                          <div>
                            <dt className="text-[#E8E1D2]/55">8. Emergency Contact</dt>
                            <dd className="mt-0.5 font-medium text-[#E8E1D2]">{emergencyContact}</dd>
                          </div>
                        </>
                      )}
                    </dl>
                    <div className="mt-4 border-t border-[#B89A62]/15 pt-3 text-xs">
                      <dt className="text-[#E8E1D2]/55">
                        {track === 'security' ? '7. Previous Experience' : '9. Previous Experiences'}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-[#E8E1D2]">
                        {experience}
                      </dd>
                    </div>
                    <div className="mt-4 border-t border-[#B89A62]/15 pt-3 text-xs">
                      <dt className="text-[#E8E1D2]/55">
                        {track === 'security'
                          ? '8. Proof of Experience'
                          : '10. Attached Certificates'}
                      </dt>
                      <dd className="mt-1 text-[#E8E1D2]">
                        {attachments.length === 0 ? (
                          <span className="text-[#E8E1D2]/55">No files attached.</span>
                        ) : (
                          <ul className="mt-1 space-y-1 font-mono text-[11px] text-[#83B5ED]">
                            {attachments.map((a) => (
                              <li key={a.id}>
                                {a.file_name} ({formatBytes(a.size_bytes)})
                              </li>
                            ))}
                          </ul>
                        )}
                      </dd>
                    </div>
                  </div>

                  {/* Department Questions Review */}
                  <div className="border border-[#B89A62]/28 bg-[#040D1B]/95 p-5">
                    <div className="flex items-center justify-between gap-2 border-b border-[#B89A62]/20 pb-3">
                      <h3 className="font-sans text-xs font-semibold tracking-[0.1em] text-[#D5BD8B] uppercase">
                        {TRACK_CATALOG.find((t) => t.id === track)?.title} Team Member Responses
                      </h3>
                      <button
                        type="button"
                        onClick={() => goToStep(3)}
                        className="text-xs font-medium text-[#83B5ED] underline hover:text-[#D5BD8B]"
                      >
                        Edit
                      </button>
                    </div>

                    <div className="mt-4 space-y-4 text-xs">
                      {activeQuestions.map((q, idx) => {
                        const baseAnswer = activeAnswers[q.id] || '—';
                        let combinedAnswer = baseAnswer;
                        if (q.id === 'security_allergies_has' && parseYesNo(baseAnswer) === 'Yes') {
                          const d = String(activeAnswers.security_allergies_details ?? '').trim();
                          if (d) combinedAnswer = `Yes — ${d}`;
                        } else if (
                          q.id === 'security_additional_info_has' &&
                          parseYesNo(baseAnswer) === 'Yes'
                        ) {
                          const d = String(
                            activeAnswers.security_additional_info_details ?? ''
                          ).trim();
                          if (d) combinedAnswer = `Yes — ${d}`;
                        }
                        return (
                          <div
                            key={q.id}
                            className="border-b border-[#B89A62]/12 pb-3 last:border-b-0 last:pb-0"
                          >
                            <p className="font-medium text-[#83B5ED]">
                              {q.number ?? 11 + idx}. {q.label}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[#E8E1D2]">
                              {combinedAnswer}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Legal Consent (Always initialized unchecked) */}
                  <div className="space-y-3 border border-[#B89A62]/28 bg-[#040D1B]/95 p-4 text-xs text-[#E8E1D2]/85">
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={privacyAccepted}
                        onChange={(e) => setPrivacyAccepted(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        I confirm all information above is accurate and agree to the{' '}
                        <button
                          type="button"
                          onClick={() => navigate('/privacy')}
                          className="text-[#83B5ED] underline hover:text-[#D5BD8B]"
                        >
                          LIS MUN Privacy Policy
                        </button>
                        .
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        I accept the{' '}
                        <button
                          type="button"
                          onClick={() => navigate('/terms')}
                          className="text-[#83B5ED] underline hover:text-[#D5BD8B]"
                        >
                          Terms &amp; Delegate/Staff Code of Conduct
                        </button>
                        .
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#B89A62]/20 pt-5">
                    <button
                      type="button"
                      onClick={() => goToStep(3)}
                      className="inline-flex items-center gap-2 border border-[#B89A62]/30 bg-[#040D1B] px-4 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#E8E1D2]/80 uppercase hover:border-[#83B5ED]/60 hover:text-white"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back to Department Questions</span>
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !trackOpen}
                      className="atlas-btn-gold inline-flex items-center gap-2 bg-[#0D1E36] px-7 py-3 font-sans text-xs font-semibold tracking-[0.12em] text-[#F0DFB8] uppercase disabled:opacity-50"
                    >
                      <span>
                        {submitting
                          ? 'Submitting Application...'
                          : `Submit ${TRACK_CATALOG.find((t) => t.id === track)?.title} Application`}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
