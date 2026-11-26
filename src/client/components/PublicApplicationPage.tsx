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
}> = [
  {
    id: 'media',
    title: 'Media',
    tagline: 'Photography, videography, and live visual storytelling across committees.',
    questionCount: MEDIA_QUESTIONS.length,
  },
  {
    id: 'volunteers',
    title: 'Volunteers',
    tagline: 'Committee floor runners, delegate support, and conference hospitality.',
    questionCount: VOLUNTEER_QUESTIONS.length,
  },
  {
    id: 'press',
    title: 'Press',
    tagline: 'Conference journalism, dispatches, interviews, and diplomatic reporting.',
    questionCount: PRESS_QUESTIONS.length,
  },
  {
    id: 'security',
    title: 'Security',
    tagline: 'Venue access control, QR gate verification, and protocol safety.',
    questionCount: SECURITY_QUESTIONS.length,
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

  // Shared General Information (Q1–Q10)
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
    if (fieldErrors[qId]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[qId];
        return next;
      });
    }
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

  const validateStep2General = (): boolean => {
    const errors = validateGeneralInfoFields(
      {
        applicant_name: applicantName,
        email,
        gender: gender || undefined,
        birth_date: birthDate,
        grade_or_year: gradeOrYear,
        institution,
        phone: combinedPhone,
        emergency_phone: emergencyContact,
        experience,
      },
      { strictV2: true }
    );
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMsg('Please complete all required General Information questions (Questions 1–10).');
      return false;
    }
    setErrorMsg('');
    return true;
  };

  const validateStep3Department = (): boolean => {
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
      birth_date: birthDate,
      experience,
      portfolio_url: portfolioUrl || undefined,
      answers: activeAnswers,
      privacy_policy_accepted: true,
      terms_accepted: true,
    });

    const deptErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(check.errors)) {
      if (
        k === 'portfolio_url' ||
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
      birth_date: birthDate,
      experience,
      portfolio_url: track === 'press' && portfolioUrl ? portfolioUrl : undefined,
      answers: activeAnswers,
      privacy_policy_accepted: privacyAccepted,
      terms_accepted: termsAccepted,
    });
    if (!check.valid) {
      setFieldErrors(check.errors);
      setErrorMsg(Object.values(check.errors).join(' '));
      return;
    }

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
            birth_date: birthDate,
            age: computeAgeFromBirthDate(birthDate) ?? 17,
            position: 'Team Member',
            experience: experience.trim(),
            portfolio_url: track === 'press' && portfolioUrl ? portfolioUrl.trim() : undefined,
            answers: {
              ...activeAnswers,
              country_code: countryCode,
            },
            attachments,
            medical_has_conditions:
              track === 'media'
                ? Boolean(activeAnswers.media_medical_concerns?.trim()) &&
                  !isNAValue(activeAnswers.media_medical_concerns)
                : medHas,
            medical_details:
              track === 'media'
                ? !isNAValue(activeAnswers.media_medical_concerns)
                  ? activeAnswers.media_medical_concerns?.trim() || ''
                  : ''
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
    { num: 2, title: 'General Info (Q1–Q10)' },
    { num: 3, title: `${TRACK_CATALOG.find((t) => t.id === track)?.title ?? track} Questions` },
    { num: 4, title: 'Review & Submit' },
  ];

  return (
    <div
      ref={wizardRef}
      className={
        embedded
          ? 'scroll-mt-24 text-[#E8E1D2]'
          : 'min-h-screen bg-[#07111f] px-4 py-8 text-[#edf3fb] sm:px-6 md:px-10 md:py-12'
      }
    >
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        {embedded ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
            <span className="font-mono text-[11px] tracking-[0.18em] text-[#B89A62] uppercase">
              Team Member Application Desk
            </span>
            <div className="flex items-center gap-2.5">
              {!successReceipt && (
                <button
                  type="button"
                  onClick={clearSavedDraft}
                  className="inline-flex items-center gap-1.5 border border-[#263D59] bg-[#071426] px-3.5 py-2 font-sans text-xs font-medium text-[#E8E1D2]/80 transition-colors hover:border-[#B89A62] hover:text-[#E8E1D2]"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#D5BD8B]" />
                  <span>Reset Form</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/portal')}
                className="border border-[#263D59] bg-[#071426] px-4 py-2 font-sans text-xs font-semibold tracking-[0.08em] text-[#D5BD8B] uppercase transition-colors hover:border-[#B89A62] hover:text-[#E8E1D2]"
              >
                Staff Portal
              </button>
            </div>
          </div>
        ) : (
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#9eb8da]/18 pb-6">
            <div>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 font-sans text-xs font-medium tracking-[0.12em] text-[#83b5ed] uppercase transition-colors hover:text-[#b3d5ff]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Living Atlas</span>
              </button>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-[#edf3fb] sm:text-5xl">
                LIS MUN Team Member Applications
              </h1>
              <p className="mt-1.5 max-w-2xl font-sans text-sm text-[#bdcce0]">
                Apply to join one of the four conference departments (Media, Volunteers, Press, or Security). Every department shares the same 10-question applicant profile followed by department-specific prompts.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              {!successReceipt && (
                <button
                  type="button"
                  onClick={clearSavedDraft}
                  className="inline-flex items-center gap-1.5 border border-[#9eb8da]/25 bg-[#09182b] px-3.5 py-2 font-sans text-xs font-medium text-[#bdcce0] transition-colors hover:border-[#83b5ed]/60 hover:text-[#edf3fb]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Form</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/portal')}
                className="border border-[#9eb8da]/30 bg-[#0e2037] px-4 py-2 font-sans text-xs font-semibold tracking-[0.08em] text-[#b3d5ff] uppercase transition-colors hover:border-[#83b5ed]"
              >
                Staff Portal
              </button>
            </div>
          </header>
        )}

        {/* Submission Confirmation Receipt */}
        {successReceipt ? (
          <section className="mt-8 border border-[#83b5ed]/40 bg-[#0e2037] p-7 sm:p-10">
            <div className="flex items-center gap-2.5 text-[#86EFAC]">
              <Check className="h-5 w-5" />
              <p className="font-mono text-xs tracking-[0.16em] uppercase">
                Application Confirmed &amp; Recorded
              </p>
            </div>
            <h2 className="mt-3 font-display text-3xl font-semibold text-[#edf3fb] sm:text-4xl">
              Reference Code:{' '}
              <span className="font-mono text-2xl tabular-nums text-[#b3d5ff] sm:text-3xl">
                {successReceipt.code}
              </span>
            </h2>
            <dl className="mt-6 grid gap-4 border-y border-[#9eb8da]/20 py-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="font-mono text-[10px] tracking-[0.14em] text-[#8da5c3] uppercase">
                  Applicant
                </dt>
                <dd className="mt-1 font-medium text-[#edf3fb]">{applicantName || 'Recorded'}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.14em] text-[#8da5c3] uppercase">
                  Department / Track
                </dt>
                <dd className="mt-1 font-medium text-[#edf3fb]">{successReceipt.department}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.14em] text-[#8da5c3] uppercase">
                  Submitted
                </dt>
                <dd className="mt-1 font-mono text-[#bdcce0]">{successReceipt.submittedAt}</dd>
              </div>
            </dl>
            <p className="mt-4 font-sans text-sm leading-relaxed text-[#bdcce0]">
              Please keep your reference code for your records. Your responses and uploaded certificates have been routed directly to the LIS MUN Secretariat and relevant Department Directorate.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setSuccessReceipt(null);
                  clearSavedDraft();
                }}
                className="border border-[#83b5ed]/55 bg-[#244b78] px-5 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-white uppercase transition-colors hover:bg-[#315f96]"
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
                className="border border-[#9eb8da]/30 bg-[#09182b] px-5 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#bdcce0] uppercase transition-colors hover:text-[#edf3fb]"
              >
                {embedded ? 'Back to Top' : 'Return to Atlas'}
              </button>
            </div>
          </section>
        ) : (
          <div
            className={`mt-7 border p-5 sm:p-8 ${
              embedded
                ? 'border-[#B89A62]/35 bg-[#071426]/95'
                : 'border-[#9eb8da]/20 bg-[#0e2037]'
            }`}
          >
            {/* Stepper Progress Indicator */}
            <nav aria-label="Application steps" className="mb-7 border-b border-[#9eb8da]/15 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                <span className="font-mono text-[11px] tracking-[0.14em] text-[#83b5ed] uppercase">
                  {TRACK_CATALOG.find((t) => t.id === track)?.title} Team Member Application
                </span>
                <span className="font-mono text-[11px] text-[#8da5c3]">
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
                        className={`flex w-full items-center gap-2.5 border px-3 py-2.5 text-left transition-colors ${
                          isCurrent
                            ? 'border-[#83b5ed] bg-[#142b49] text-[#edf3fb]'
                            : isDone
                            ? 'border-[#83b5ed]/35 bg-[#09182b] text-[#b3d5ff]'
                            : 'border-[#9eb8da]/15 bg-[#09182b]/60 text-[#8da5c3] hover:text-[#bdcce0]'
                        }`}
                      >
                        <span className="font-mono text-[11px] font-semibold tabular-nums">
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
                    <h2 className="font-display text-2xl font-semibold text-[#edf3fb]">
                      Select Your Department
                    </h2>
                    <p className="mt-1 text-xs text-[#bdcce0]">
                      Each team department uses a dedicated application with shared general information (Questions 1–10) and role-specific questions.
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
                            className={`flex flex-col justify-between border p-4 text-left transition-colors ${
                              selected
                                ? 'border-[#83b5ed] bg-[#142b49]'
                                : 'border-[#9eb8da]/20 bg-[#09182b] hover:border-[#83b5ed]/50'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-display text-2xl font-semibold text-[#edf3fb]">
                                  {item.title}
                                </span>
                                <StatusLabel status={open ? 'Open' : 'Closed'} tone={open ? 'green' : 'red'} />
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-[#bdcce0]">
                                {item.tagline}
                              </p>
                            </div>
                            <p className="mt-3 font-mono text-[10px] tracking-[0.12em] text-[#83b5ed] uppercase">
                              10 General + {item.questionCount} Department Questions
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
                        <p className="mt-1 text-xs text-[#bdcce0]">
                          This division is currently closed by the Secretariat. Select another open department to apply.
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end border-t border-[#9eb8da]/15 pt-5">
                      <button
                        type="button"
                        disabled={!trackOpen}
                        onClick={() => {
                          setStep(2);
                          scrollWizardIntoView();
                        }}
                        className="inline-flex items-center gap-2 border border-[#83b5ed]/55 bg-[#244b78] px-6 py-2.5 font-sans text-xs font-semibold tracking-[0.1em] text-white uppercase transition-colors hover:bg-[#315f96] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span>Continue to General Information</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: SHARED GENERAL INFORMATION (QUESTIONS 1–10) */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div className="border-b border-[#9eb8da]/15 pb-4">
                      <p className="font-mono text-[10px] tracking-[0.16em] text-[#83b5ed] uppercase">
                        Section 1 · Required for All Departments
                      </p>
                      <h2 className="mt-1 font-display text-2xl font-semibold text-[#edf3fb] sm:text-3xl">
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
                        <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                          1. What is your full name? <span className="text-[#83b5ed]">*</span>
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
                          className="mt-1.5 w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                        />
                        {fieldErrors.applicant_name && (
                          <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.applicant_name}</p>
                        )}
                      </div>

                      {/* Q2 */}
                      <div>
                        <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                          2. What is your email? <span className="text-[#83b5ed]">*</span>
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
                          className="mt-1.5 w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                        />
                        {fieldErrors.email && (
                          <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.email}</p>
                        )}
                      </div>

                      {/* Q3 */}
                      <div>
                        <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                          3. What is your gender? <span className="text-[#83b5ed]">*</span>
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
                              className={`border py-2.5 text-center font-sans text-sm font-medium transition-colors ${
                                gender === opt.val
                                  ? 'border-[#83b5ed] bg-[#142b49] text-[#edf3fb]'
                                  : 'border-[#9eb8da]/25 bg-[#09182b] text-[#bdcce0] hover:border-[#83b5ed]/50'
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
                          <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                            4. When is your birth date? <span className="text-[#83b5ed]">*</span>
                          </label>
                          {computedAge !== null && (
                            <span className="font-mono text-[11px] tabular-nums text-[#83b5ed]">
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
                          className="mt-1.5 w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 font-mono text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                        />
                        {fieldErrors.birth_date && (
                          <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.birth_date}</p>
                        )}
                      </div>

                      {/* Q5 */}
                      <div>
                        <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                          5. What grade are you? <span className="text-[#83b5ed]">*</span>
                        </label>
                        <select
                          value={gradeOrYear}
                          onChange={(e) => {
                            setGradeOrYear(e.target.value);
                            if (fieldErrors.grade_or_year) {
                              setFieldErrors((p) => ({ ...p, grade_or_year: '' }));
                            }
                          }}
                          className="mt-1.5 w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
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
                        <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                          6. What school are you in? <span className="text-[#83b5ed]">*</span>
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
                          className="mt-1.5 w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                        />
                        <p className="mt-1 text-[11px] font-medium text-[#b3d5ff]">
                          Do not use abbreviations (e.g. write Leadership International School, not LIS).
                        </p>
                        {fieldErrors.institution && (
                          <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.institution}</p>
                        )}
                      </div>

                      {/* Q7 */}
                      <div>
                        <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                          7. What is your phone number? <span className="text-[#83b5ed]">*</span>
                        </label>
                        <div className="mt-1.5 flex gap-2">
                          <select
                            aria-label="Country dial code"
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            className="w-40 shrink-0 border border-[#9eb8da]/25 bg-[#09182b] px-2.5 py-2.5 font-mono text-xs text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
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
                            className="w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 font-mono text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                          />
                        </div>
                        {combinedPhone && (
                          <p className="mt-1 font-mono text-[10px] text-[#8da5c3]">
                            Formatted: {combinedPhone}
                          </p>
                        )}
                        {fieldErrors.phone && (
                          <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.phone}</p>
                        )}
                      </div>

                      {/* Q8 */}
                      <div>
                        <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                          8. Please enter an emergency contact. <span className="text-[#83b5ed]">*</span>
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
                          className="mt-1.5 w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                        />
                        {fieldErrors.emergency_phone && (
                          <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.emergency_phone}</p>
                        )}
                      </div>
                    </div>

                    {/* Q9 */}
                    <div>
                      <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                        9. Please list your previous experiences. <span className="text-[#83b5ed]">*</span>
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
                        className="mt-1.5 w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                      />
                      {fieldErrors.experience && (
                        <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.experience}</p>
                      )}
                    </div>

                    {/* Q10 */}
                    <div className="border border-[#9eb8da]/20 bg-[#09182b] p-4 sm:p-5">
                      <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                        10. Please attach certificates for your experiences.
                      </label>
                      <p className="mt-1 text-xs text-[#8da5c3]">
                        Multiple files supported. Accepted formats: PDF, JPG, JPEG, and PNG (max 15 MB per file).
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 border border-[#83b5ed]/45 bg-[#142b49] px-4 py-2 font-sans text-xs font-semibold text-[#b3d5ff] transition-colors hover:border-[#b3d5ff]">
                          <Upload className="h-3.5 w-3.5" />
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
                        <span className="font-mono text-[11px] text-[#8da5c3]">
                          {attachments.length} file{attachments.length === 1 ? '' : 's'} attached
                        </span>
                      </div>

                      {attachments.length > 0 && (
                        <ul className="mt-4 divide-y divide-[#9eb8da]/15 border border-[#9eb8da]/20 bg-[#07111f]">
                          {attachments.map((att) => (
                            <li
                              key={att.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <FileText className="h-4 w-4 shrink-0 text-[#83b5ed]" />
                                <span className="truncate font-medium text-[#edf3fb]">
                                  {att.file_name}
                                </span>
                                <span className="font-mono text-[10px] text-[#8da5c3]">
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

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#9eb8da]/15 pt-5">
                      <button
                        type="button"
                        onClick={() => goToStep(1)}
                        className="inline-flex items-center gap-2 border border-[#9eb8da]/30 bg-[#09182b] px-4 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#bdcce0] uppercase hover:text-white"
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
                        className="inline-flex items-center gap-2 border border-[#83b5ed]/55 bg-[#244b78] px-6 py-2.5 font-sans text-xs font-semibold tracking-[0.1em] text-white uppercase hover:bg-[#315f96]"
                      >
                        <span>Continue to Department Questions</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: STRICTLY DEPARTMENT-ISOLATED QUESTIONS */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div className="border-b border-[#9eb8da]/15 pb-4">
                      <p className="font-mono text-[10px] tracking-[0.16em] text-[#83b5ed] uppercase">
                        Section 2 · Department-Specific Application
                      </p>
                      <h2 className="mt-1 font-display text-2xl font-semibold text-[#edf3fb] sm:text-3xl">
                        {TRACK_CATALOG.find((t) => t.id === track)?.title} Team Member Questions
                      </h2>
                    </div>

                    <div className="space-y-6">
                        {track === 'press' && (
                          <div>
                            <label className="block font-sans text-xs font-semibold text-[#edf3fb]">
                              Writing Portfolio / Published Clips URL (Optional)
                            </label>
                            <input
                              type="url"
                              value={portfolioUrl}
                              onChange={(e) => setPortfolioUrl(e.target.value)}
                              placeholder="https://portfolio.example.com"
                              className="mt-1.5 w-full border border-[#9eb8da]/25 bg-[#09182b] px-3 py-2.5 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                            />
                            {fieldErrors.portfolio_url && (
                              <p className="mt-1 text-xs text-[#FCA5A5]">{fieldErrors.portfolio_url}</p>
                            )}
                          </div>
                        )}

                        {activeQuestions.map((q, idx) => {
                          const qNum = q.number ?? 11 + idx;
                          const val = activeAnswers[q.id] ?? '';
                          const wc = wordCount(val);
                          const needsMediaScheduleExplanation =
                            q.id === 'media_anything_else' && mediaScheduleNeedsExplanation;

                          return (
                            <div
                              key={q.id}
                              className={`border p-4 sm:p-5 ${
                                q.confidentialMedical
                                  ? 'border-[#83b5ed]/30 bg-[#09182b]'
                                  : 'border-[#9eb8da]/20 bg-[#09182b]'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <label className="block font-sans text-sm font-semibold text-[#edf3fb]">
                                  {qNum}. {q.label} <span className="text-[#83b5ed]">*</span>
                                </label>
                                {q.kind !== 'yes_no' && q.minWords > 1 && (
                                  <span
                                    className={`font-mono text-[11px] tabular-nums ${
                                      wc >= q.minWords ? 'text-[#86EFAC]' : 'text-[#FCD34D]'
                                    }`}
                                  >
                                    {wc} / {q.minWords} min words
                                  </span>
                                )}
                              </div>

                              {q.hint && (
                                <p className="mt-1 text-xs text-[#8da5c3]">{q.hint}</p>
                              )}

                              {needsMediaScheduleExplanation && (
                                <p className="mt-2 border border-[#FCD34D]/45 bg-[#1B1406] px-3 py-2 text-xs text-[#FCD34D]">
                                  You indicated you may miss part of the conference or pre-MUN orientation. Please explain your scheduling details here.
                                </p>
                              )}

                              {q.kind === 'yes_no' ? (
                                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:max-w-xs">
                                  {(['Yes', 'No'] as const).map((opt) => {
                                    const selected = parseYesNo(val) === opt;
                                    return (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => updateAnswer(q.id, opt)}
                                        className={`border py-2 text-center font-sans text-xs font-semibold transition-colors ${
                                          selected
                                            ? 'border-[#83b5ed] bg-[#142b49] text-[#edf3fb]'
                                            : 'border-[#9eb8da]/25 bg-[#07111f] text-[#bdcce0] hover:border-[#83b5ed]/50'
                                        }`}
                                      >
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <textarea
                                  rows={q.minWords >= 40 ? 4 : 3}
                                  value={val}
                                  onChange={(e) => updateAnswer(q.id, e.target.value)}
                                  placeholder={q.placeholder}
                                  className="mt-3 w-full border border-[#9eb8da]/25 bg-[#07111f] px-3 py-2.5 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                                />
                              )}

                              {fieldErrors[q.id] && (
                                <p className="mt-1.5 text-xs text-[#FCA5A5]">{fieldErrors[q.id]}</p>
                              )}
                            </div>
                          );
                        })}

                        {/* Admin-Only Confidential Medical Disclosure for non-Media tracks (Media has Q17 built-in) */}
                        {track !== 'media' && (
                          <div className="border border-[#9eb8da]/20 bg-[#09182b] p-4">
                            <div className="flex items-center gap-2 text-[#b3d5ff]">
                              <ShieldCheck className="h-4 w-4" />
                              <span className="font-mono text-[10px] tracking-[0.14em] uppercase">
                                Confidential Medical Disclosure (Optional · Admin-Only Access)
                              </span>
                            </div>
                            <label className="mt-3 flex items-center gap-2.5 text-xs text-[#bdcce0]">
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
                                className="mt-3 w-full border border-[#9eb8da]/25 bg-[#07111f] px-3 py-2 text-sm text-[#edf3fb] focus:border-[#83b5ed] focus:outline-none"
                              />
                            )}
                          </div>
                        )}
                      </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#9eb8da]/15 pt-5">
                      <button
                        type="button"
                        onClick={() => goToStep(2)}
                        className="inline-flex items-center gap-2 border border-[#9eb8da]/30 bg-[#09182b] px-4 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#bdcce0] uppercase hover:text-white"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Back to General Info</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (validateStep3Department()) {
                            setStep(4);
                            scrollWizardIntoView();
                          }
                        }}
                        className="inline-flex items-center gap-2 border border-[#83b5ed]/55 bg-[#244b78] px-6 py-2.5 font-sans text-xs font-semibold tracking-[0.1em] text-white uppercase hover:bg-[#315f96]"
                      >
                        <span>Review Application</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4: REVIEW & FINAL CONSENT SUBMISSION */}
                {step === 4 && (
                  <div className="space-y-6">
                    <div className="border-b border-[#9eb8da]/15 pb-4">
                      <p className="font-mono text-[10px] tracking-[0.16em] text-[#83b5ed] uppercase">
                        Section 3 · Pre-Submission Verification
                      </p>
                      <h2 className="mt-1 font-display text-2xl font-semibold text-[#edf3fb] sm:text-3xl">
                        Review Your Application
                      </h2>
                    </div>

                    {/* General Information Review */}
                    <div className="border border-[#9eb8da]/20 bg-[#09182b] p-5">
                      <div className="flex items-center justify-between gap-2 border-b border-[#9eb8da]/15 pb-3">
                        <h3 className="font-sans text-xs font-semibold tracking-[0.1em] text-[#b3d5ff] uppercase">
                          General Information (Questions 1–10)
                        </h3>
                        <button
                          type="button"
                          onClick={() => goToStep(2)}
                          className="text-xs font-medium text-[#83b5ed] underline"
                        >
                          Edit
                        </button>
                      </div>
                      <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="text-[#8da5c3]">1. Full Name</dt>
                          <dd className="mt-0.5 font-medium text-[#edf3fb]">{applicantName}</dd>
                        </div>
                        <div>
                          <dt className="text-[#8da5c3]">2. Email</dt>
                          <dd className="mt-0.5 font-medium text-[#edf3fb]">{email}</dd>
                        </div>
                        <div>
                          <dt className="text-[#8da5c3]">3. Gender</dt>
                          <dd className="mt-0.5 font-medium capitalize text-[#edf3fb]">{gender}</dd>
                        </div>
                        <div>
                          <dt className="text-[#8da5c3]">4. Birth Date</dt>
                          <dd className="mt-0.5 font-mono text-[#edf3fb]">
                            {birthDate} {computedAge !== null ? `(Age ${computedAge})` : ''}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[#8da5c3]">5. Grade</dt>
                          <dd className="mt-0.5 font-medium text-[#edf3fb]">{gradeOrYear}</dd>
                        </div>
                        <div>
                          <dt className="text-[#8da5c3]">6. School</dt>
                          <dd className="mt-0.5 font-medium text-[#edf3fb]">{institution}</dd>
                        </div>
                        <div>
                          <dt className="text-[#8da5c3]">7. Phone Number</dt>
                          <dd className="mt-0.5 font-mono text-[#edf3fb]">{combinedPhone}</dd>
                        </div>
                        <div>
                          <dt className="text-[#8da5c3]">8. Emergency Contact</dt>
                          <dd className="mt-0.5 font-medium text-[#edf3fb]">{emergencyContact}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 border-t border-[#9eb8da]/15 pt-3 text-xs">
                        <dt className="text-[#8da5c3]">9. Previous Experiences</dt>
                        <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-[#edf3fb]">
                          {experience}
                        </dd>
                      </div>
                      <div className="mt-4 border-t border-[#9eb8da]/15 pt-3 text-xs">
                        <dt className="text-[#8da5c3]">10. Attached Certificates</dt>
                        <dd className="mt-1 text-[#edf3fb]">
                          {attachments.length === 0 ? (
                            <span className="text-[#8da5c3]">No certificates attached.</span>
                          ) : (
                            <ul className="mt-1 space-y-1 font-mono text-[11px]">
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
                    <div className="border border-[#9eb8da]/20 bg-[#09182b] p-5">
                      <div className="flex items-center justify-between gap-2 border-b border-[#9eb8da]/15 pb-3">
                        <h3 className="font-sans text-xs font-semibold tracking-[0.1em] text-[#b3d5ff] uppercase">
                          {TRACK_CATALOG.find((t) => t.id === track)?.title} Team Member Responses
                        </h3>
                        <button
                          type="button"
                          onClick={() => goToStep(3)}
                          className="text-xs font-medium text-[#83b5ed] underline"
                        >
                          Edit
                        </button>
                      </div>

                      <div className="mt-4 space-y-4 text-xs">
                        {activeQuestions.map((q, idx) => (
                          <div key={q.id} className="border-b border-[#9eb8da]/10 pb-3 last:border-b-0 last:pb-0">
                            <p className="font-medium text-[#8da5c3]">
                              {q.number ?? 11 + idx}. {q.label}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[#edf3fb]">
                              {activeAnswers[q.id] || '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Legal Consent (Always initialized unchecked) */}
                    <div className="space-y-3 border border-[#9eb8da]/20 bg-[#09182b] p-4 text-xs text-[#bdcce0]">
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
                            className="text-[#83b5ed] underline"
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
                            className="text-[#83b5ed] underline"
                          >
                            Terms &amp; Delegate/Staff Code of Conduct
                          </button>
                          .
                        </span>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#9eb8da]/15 pt-5">
                      <button
                        type="button"
                        onClick={() => goToStep(3)}
                        className="inline-flex items-center gap-2 border border-[#9eb8da]/30 bg-[#09182b] px-4 py-2.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#bdcce0] uppercase hover:text-white"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Back to Department Questions</span>
                      </button>
                      <button
                        type="submit"
                        disabled={submitting || !trackOpen}
                        className="inline-flex items-center gap-2 border border-[#83b5ed]/65 bg-[#244b78] px-7 py-3 font-sans text-xs font-semibold tracking-[0.12em] text-white uppercase transition-colors hover:bg-[#315f96] disabled:opacity-50"
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
