import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, ShieldCheck, Upload } from 'lucide-react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { apiRequest } from '../api';
import { navigate } from '../router';
import {
  MEDIA_QUESTIONS,
  SECURITY_QUESTIONS,
  VOLUNTEER_QUESTIONS,
  wordCount,
} from '../../shared/intake';
import type {
  ApplicationAttachmentRef,
  DepartmentRecord,
} from '../../shared/types';
import { StatusLabel } from './UiPrimitives';

type PublicIntakeTab = 'team' | 'chair' | 'inquiry';
type TeamTrack = 'security' | 'media' | 'press' | 'volunteers';

export const PublicApplicationPage: React.FC<{ initialTab?: PublicIntakeTab }> = ({
  initialTab = 'team',
}) => {
  const [tab, setTab] = useState<PublicIntakeTab>(initialTab);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successCode, setSuccessCode] = useState<string | null>(null);

  // Team Form State (legal checkboxes ALWAYS initialized false on load)
  const [track, setTrack] = useState<TeamTrack>('security');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [applicantName, setApplicantName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [institution, setInstitution] = useState('');
  const [gradeOrYear, setGradeOrYear] = useState('');
  const [age, setAge] = useState('17');
  const [position, setPosition] = useState('Team Member');
  const [experience, setExperience] = useState('');
  const [statement, setStatement] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<ApplicationAttachmentRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [medHas, setMedHas] = useState(false);
  const [medDetails, setMedDetails] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  // Chair State
  const [chairCommittees, setChairCommittees] = useState('');

  // Inquiry State
  const [inqSubject, setInqSubject] = useState('');
  const [inqMessage, setInqMessage] = useState('');

  // 30s Live Availability Polling
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

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setErrorMsg('');
    try {
      const init = await apiRequest<{ uploadUrl: string }>('/api/public/files/init-upload', {
        method: 'POST',
        body: {
          application_type: track,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
        skipAuth: true,
      });
      const up = await apiRequest<{ attachment: ApplicationAttachmentRef }>(init.uploadUrl, {
        method: 'PUT',
        rawBody: file,
        contentType: file.type,
        skipAuth: true,
      });
      setAttachments((prev) => [...prev, up.attachment]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'File upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const activeQuestions =
    track === 'security'
      ? SECURITY_QUESTIONS
      : track === 'volunteers'
      ? VOLUNTEER_QUESTIONS
      : MEDIA_QUESTIONS;

  const submitTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const parsedPhone = parsePhoneNumberFromString(phone, 'SA');
    const normalizedPhone = parsedPhone?.isValid() ? parsedPhone.number : phone;
    const parsedEmerg = parsePhoneNumberFromString(emergencyPhone, 'SA');
    const normalizedEmerg = parsedEmerg?.isValid() ? parsedEmerg.number : emergencyPhone;

    setSubmitting(true);
    try {
      const res = await apiRequest<{ application_code: string }>(
        '/api/public/applications/team',
        {
          method: 'POST',
          skipAuth: true,
          body: {
            track,
            gender,
            applicant_name: applicantName,
            email,
            phone: normalizedPhone,
            emergency_phone: normalizedEmerg,
            institution,
            grade_or_year: gradeOrYear,
            age: Number(age),
            position,
            experience,
            statement,
            portfolio_url: portfolioUrl,
            answers,
            attachments,
            medical_has_conditions: medHas,
            medical_details: medDetails,
            privacy_policy_accepted: privacyAccepted,
            terms_accepted: termsAccepted,
            website: honeypot,
          },
        }
      );
      setSuccessCode(res.application_code);
    } catch (err: unknown) {
      const details = (err as { details?: { errors?: Record<string, string> } })?.details;
      if (details?.errors) {
        setErrorMsg(Object.values(details.errors).join(' '));
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitChair = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ application: { application_code: string } }>(
        '/api/public/applications/chair',
        {
          method: 'POST',
          skipAuth: true,
          body: {
            full_name: applicantName,
            email,
            phone,
            institution,
            age: Number(age),
            committee_preferences: chairCommittees,
            experience,
            statement,
            privacy_policy_accepted: privacyAccepted,
            terms_accepted: termsAccepted,
            website: honeypot,
          },
        }
      );
      setSuccessCode(res.application.application_code);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Chair submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      await apiRequest('/api/public/inquiries', {
        method: 'POST',
        skipAuth: true,
        body: {
          full_name: applicantName,
          email,
          subject: inqSubject || 'Conference Inquiry',
          message: inqMessage,
          website: honeypot,
        },
      });
      setSuccessCode('INQUIRY-RECEIVED');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Inquiry failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const trackOpen = isTrackOpen(track);

  return (
    <div className="min-h-screen bg-[#030914] px-4 py-10 text-[#E8E1D2] md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#263D59]/70 pb-6">
          <div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.16em] text-[#B89A62] uppercase hover:text-[#D5BD8B]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Living Atlas</span>
            </button>
            <h1 className="mt-3 font-display text-4xl font-medium text-[#E8E1D2] md:text-5xl">
              Executive Staff, Chair &amp; Secretariat Intake
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="border border-[#263D59] bg-[#071426] px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#D5BD8B] uppercase hover:border-[#B89A62]"
          >
            Staff Portal
          </button>
        </div>

        {/* Track Selector */}
        <div className="mt-8 grid grid-cols-3 border border-[#263D59]">
          {[
            { id: 'team' as const, label: 'Organizing Team (Staff)' },
            { id: 'chair' as const, label: 'Committee Chair / Dais' },
            { id: 'inquiry' as const, label: 'Secretariat Inquiry' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setErrorMsg('');
                setSuccessCode(null);
              }}
              className={`border-r border-[#263D59] py-3 font-mono text-xs tracking-[0.14em] uppercase last:border-r-0 ${
                tab === item.id
                  ? 'bg-[#0D1E36] text-[#D5BD8B]'
                  : 'bg-[#071426]/50 text-[#E8E1D2]/65 hover:text-[#E8E1D2]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {successCode ? (
          <div className="mt-8 border border-[#B89A62]/55 bg-[#071426] p-8">
            <div className="flex items-center gap-3 text-[#D5BD8B]">
              <Check className="h-5 w-5" />
              <p className="font-mono text-xs tracking-[0.18em] uppercase">
                Submission Recorded
              </p>
            </div>
            <h2 className="mt-3 font-display text-3xl text-[#E8E1D2]">
              Reference Code: <span className="font-mono tabular-nums text-[#D5BD8B]">{successCode}</span>
            </h2>
            <p className="mt-2 font-sans text-sm text-[#E8E1D2]/75">
              Your submission is encrypted in transit and stored in the LIS MUN conference registry. Our HR &amp; Secretariat teams will follow up by email.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setSuccessCode(null)}
                className="border border-[#B89A62] px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#D5BD8B] uppercase"
              >
                Submit Another
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="border border-[#263D59] px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#E8E1D2]/80 uppercase"
              >
                Back to Atlas
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 border border-[#263D59]/80 bg-[#071426] p-6 md:p-8">
            {errorMsg && (
              <div className="mb-5 border border-[#DC2626]/60 bg-[#1B0B10] p-3.5 font-sans text-xs text-[#FCA5A5]">
                {errorMsg}
              </div>
            )}

            {tab === 'team' && (
              <form onSubmit={submitTeam} className="space-y-6">
                {/* Honeypot */}
                <input
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                />

                <div>
                  <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Select Recruiting Department
                  </label>
                  <div className="mt-2 grid gap-2.5 sm:grid-cols-4">
                    {(['security', 'volunteers', 'media', 'press'] as const).map((t) => {
                      const open = isTrackOpen(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTrack(t)}
                          className={`border p-3 text-left transition-colors ${
                            track === t
                              ? 'border-[#D5BD8B] bg-[#0D1E36]'
                              : 'border-[#263D59] bg-[#030914] hover:border-[#B89A62]/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs uppercase text-[#E8E1D2]">{t}</span>
                            <StatusLabel status={open ? 'Open' : 'Closed'} tone={open ? 'green' : 'red'} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!trackOpen ? (
                  <div className="border border-[#DC2626]/50 bg-[#1B0B10] p-6 text-center">
                    <p className="font-display text-2xl text-[#FCA5A5]">Applications Closed</p>
                    <p className="mt-1 font-sans text-xs text-[#E8E1D2]/70">
                      Applications for the {track} division are currently paused by the Secretariat.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                          Division / Gender Section *
                        </label>
                        <select
                          value={gender}
                          onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                          className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                        >
                          <option value="male">Male Division</option>
                          <option value="female">Female Division</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                          Target Position *
                        </label>
                        <select
                          value={position}
                          onChange={(e) => setPosition(e.target.value)}
                          className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                        >
                          <option value="Team Member">Team Member</option>
                          <option value="Co-Head">Co-Head</option>
                          <option value="Department Head">Department Head</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                          Full Name *
                        </label>
                        <input
                          required
                          value={applicantName}
                          onChange={(e) => setApplicantName(e.target.value)}
                          className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                          Email Address *
                        </label>
                        <input
                          required
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                          Applicant Phone (Intl / E.164) *
                        </label>
                        <input
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+966 5X XXX XXXX"
                          className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 font-mono text-sm text-[#E8E1D2]"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                          Emergency / Guardian Phone *
                        </label>
                        <input
                          required
                          value={emergencyPhone}
                          onChange={(e) => setEmergencyPhone(e.target.value)}
                          placeholder="+966 5X XXX XXXX"
                          className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 font-mono text-sm text-[#E8E1D2]"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                          School / University *
                        </label>
                        <input
                          required
                          value={institution}
                          onChange={(e) => setInstitution(e.target.value)}
                          className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                            Grade / Year
                          </label>
                          <input
                            value={gradeOrYear}
                            onChange={(e) => setGradeOrYear(e.target.value)}
                            placeholder="Grade 11"
                            className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                          />
                        </div>
                        <div>
                          <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                            Age *
                          </label>
                          <input
                            required
                            type="number"
                            min={14}
                            max={35}
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 font-mono text-sm tabular-nums text-[#E8E1D2]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Department-Specific Assessment Prompts */}
                    <div className="space-y-4 border-t border-[#263D59]/60 pt-5">
                      <p className="font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase">
                        {track} Assessment Questions
                      </p>
                      {(track === 'media' || track === 'press') && (
                        <div>
                          <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                            Portfolio URL (https://...)
                          </label>
                          <input
                            type="url"
                            value={portfolioUrl}
                            onChange={(e) => setPortfolioUrl(e.target.value)}
                            placeholder="https://portfolio.example.com"
                            className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                          />
                        </div>
                      )}
                      {activeQuestions.map((q) => {
                        const val = answers[q.id] || '';
                        const wc = wordCount(val);
                        const okWords = wc >= q.minWords;
                        return (
                          <div key={q.id}>
                            <div className="flex items-center justify-between gap-2">
                              <label className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                                {q.label} *
                              </label>
                              <span
                                className={`font-mono text-[10px] tabular-nums ${
                                  okWords ? 'text-[#86EFAC]' : 'text-[#FCD34D]'
                                }`}
                              >
                                {wc} / {q.minWords} min words
                              </span>
                            </div>
                            <textarea
                              rows={3}
                              value={val}
                              onChange={(e) =>
                                setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              placeholder={q.placeholder}
                              className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Private Attachments */}
                    <div className="border-t border-[#263D59]/60 pt-5">
                      <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                        Portfolio Samples / CV (Private Upload — JPEG, PNG, WebP, PDF)
                      </label>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 border border-[#263D59] bg-[#030914] px-4 py-2 font-mono text-xs text-[#D5BD8B] hover:border-[#B89A62]">
                          <Upload className="h-3.5 w-3.5" />
                          <span>{uploading ? 'Uploading...' : 'Attach File'}</span>
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            disabled={uploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleFileUpload(f);
                            }}
                            className="hidden"
                          />
                        </label>
                        {attachments.map((a) => (
                          <span
                            key={a.id}
                            className="border border-[#B89A62]/40 bg-[#030914] px-2.5 py-1 font-mono text-[11px] text-[#E8E1D2]"
                          >
                            {a.file_name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Confidential Medical Disclosure (Isolated Table) */}
                    <div className="border border-[#263D59] bg-[#030914] p-4">
                      <div className="flex items-center gap-2 text-[#D5BD8B]">
                        <ShieldCheck className="h-4 w-4" />
                        <span className="font-mono text-[10px] tracking-[0.18em] uppercase">
                          Confidential Medical Disclosure (Admin-Only Access)
                        </span>
                      </div>
                      <label className="mt-3 flex items-center gap-2.5 text-xs text-[#E8E1D2]/85">
                        <input
                          type="checkbox"
                          checked={medHas}
                          onChange={(e) => setMedHas(e.target.checked)}
                        />
                        <span>I have medical conditions, allergies, or emergency accommodations to disclose.</span>
                      </label>
                      {medHas && (
                        <textarea
                          rows={2}
                          value={medDetails}
                          onChange={(e) => setMedDetails(e.target.value)}
                          placeholder="Provide confidential details (never shown to Department Heads or HR)..."
                          className="mt-3 w-full border border-[#263D59] bg-[#071426] px-3 py-2 text-sm text-[#E8E1D2]"
                        />
                      )}
                    </div>

                    {/* Legal Consent (Always Unchecked Initially) */}
                    <div className="space-y-2.5 border-t border-[#263D59]/60 pt-5 text-xs text-[#E8E1D2]/80">
                      <label className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={privacyAccepted}
                          onChange={(e) => setPrivacyAccepted(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          I agree to the{' '}
                          <button
                            type="button"
                            onClick={() => navigate('/privacy')}
                            className="text-[#D5BD8B] underline"
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
                            className="text-[#D5BD8B] underline"
                          >
                            Terms &amp; Delegate/Staff Code of Conduct
                          </button>
                          .
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="atlas-btn-gold w-full border border-[#B89A62] bg-[#030914] py-3.5 font-mono text-xs font-medium tracking-[0.2em] text-[#D5BD8B] uppercase disabled:opacity-50"
                    >
                      {submitting ? 'Submitting Application...' : `Submit ${track} Application`}
                    </button>
                  </>
                )}
              </form>
            )}

            {tab === 'chair' && (
              <form onSubmit={submitChair} className="space-y-4">
                <input
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="hidden"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    required
                    placeholder="Full Name *"
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email Address *"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                  />
                  <input
                    required
                    placeholder="School / University *"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                  />
                  <input
                    placeholder="Preferred Committee(s) (e.g. UNSC, ICJ)"
                    value={chairCommittees}
                    onChange={(e) => setChairCommittees(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                  />
                </div>
                <textarea
                  required
                  rows={3}
                  placeholder="Prior MUN Chairing & Dais Experience *"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                />
                <textarea
                  required
                  rows={4}
                  placeholder="Academic & Procedural Statement *"
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                />
                <div className="space-y-2 text-xs text-[#E8E1D2]/80">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    />
                    <span>I accept the Privacy Policy.</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    <span>I accept the Terms &amp; Conditions.</span>
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full border border-[#B89A62] bg-[#030914] py-3 font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase"
                >
                  {submitting ? 'Submitting...' : 'Submit Chair Application'}
                </button>
              </form>
            )}

            {tab === 'inquiry' && (
              <form onSubmit={submitInquiry} className="space-y-4">
                <input
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="hidden"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    required
                    placeholder="Full Name *"
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email Address *"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                  />
                </div>
                <input
                  placeholder="Subject"
                  value={inqSubject}
                  onChange={(e) => setInqSubject(e.target.value)}
                  className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                />
                <textarea
                  required
                  rows={4}
                  placeholder="Your Message to the LIS MUN Secretariat *"
                  value={inqMessage}
                  onChange={(e) => setInqMessage(e.target.value)}
                  className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full border border-[#B89A62] bg-[#030914] py-3 font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase"
                >
                  {submitting ? 'Sending...' : 'Send Secretariat Inquiry'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
