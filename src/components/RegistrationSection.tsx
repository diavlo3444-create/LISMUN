import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, X } from 'lucide-react';
import { TBA_COMMITTEE_OPTION } from '../data/conferenceData';
import type {
  DelegateTrack,
  RegistrationPayload,
  RegistrationReceipt,
} from '../types/atlas';
import {
  createAtlasScrollContext,
  gsap,
  observeAmbientVisibility,
  prepareSvgPathDraw,
} from '../utils/atlasAnimations';
import {
  generateDossierCode,
  validateRegistration,
} from '../utils/cartography';
import { apiRequest } from '../client/api';
import { navigate } from '../client/router';

interface RegistrationSectionProps {
  isModalOpen: boolean;
  preselectedCommitteeId: string;
  onOpenModal: () => void;
  onCloseModal: () => void;
}

const STORAGE_KEY = 'lismun_living_atlas_registration_v1';
const LEGACY_STORAGE_KEY = 'britus_living_atlas_registration_v1';

export const RegistrationSection: React.FC<RegistrationSectionProps> = ({
  isModalOpen,
  preselectedCommitteeId,
  onOpenModal,
  onCloseModal,
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const bookLeftPageRef = useRef<SVGGElement>(null);
  const bookRightPageRef = useRef<SVGGElement>(null);
  const bookRouteRef = useRef<SVGPathElement>(null);

  const [track, setTrack] = useState<DelegateTrack>('individual');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [institution, setInstitution] = useState('');
  const [countryOrCity, setCountryOrCity] = useState('');
  const [preferredCommitteeId, setPreferredCommitteeId] = useState(
    preselectedCommitteeId || TBA_COMMITTEE_OPTION.id
  );
  const [delegationSize, setDelegationSize] = useState(6);
  const [experienceLevel, setExperienceLevel] =
    useState<RegistrationPayload['experienceLevel']>('Experienced Delegate');
  const [motivationNote, setMotivationNote] = useState('');
  const [tier, setTier] = useState<'early_bird' | 'regular'>('early_bird');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [errors, setErrors] = useState<
    Partial<Record<keyof RegistrationPayload, string>>
  >({});
  const [receipt, setReceipt] = useState<RegistrationReceipt | null>(() => {
    try {
      const saved =
        window.localStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as RegistrationReceipt) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (preselectedCommitteeId) {
      setPreferredCommitteeId(preselectedCommitteeId);
    }
  }, [preselectedCommitteeId]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const stopAmbient = observeAmbientVisibility(section);
    const stopCtx = createAtlasScrollContext(section, () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top 78%',
          once: true,
        },
      });

      if (bookRouteRef.current) {
        prepareSvgPathDraw(bookRouteRef.current);
        tl.to(
          bookRouteRef.current,
          {
            strokeDashoffset: 0,
            duration: 0.75,
            ease: 'power2.out',
          },
          0
        );
      }

      tl.fromTo(
        bookLeftPageRef.current,
        { rotationY: 42, opacity: 0.15, transformOrigin: 'right center' },
        { rotationY: 0, opacity: 1, duration: 0.75, ease: 'power3.out' },
        0.14
      )
        .fromTo(
          bookRightPageRef.current,
          { rotationY: -42, opacity: 0.15, transformOrigin: 'left center' },
          { rotationY: 0, opacity: 1, duration: 0.75, ease: 'power3.out' },
          0.14
        )
        .fromTo(
          '[data-reg-stagger]',
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.65, stagger: 0.1, ease: 'power3.out' },
          0.25
        );
    });

    return () => {
      stopAmbient();
      stopCtx();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    const payload: RegistrationPayload = {
      track,
      fullName: fullName.trim(),
      email: email.trim(),
      institution: institution.trim(),
      countryOrCity: countryOrCity.trim(),
      preferredCommitteeId,
      delegationSize: track === 'delegation' ? Number(delegationSize) : 1,
      experienceLevel,
      motivationNote: motivationNote.trim(),
    };

    const result = validateRegistration(payload);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    if (!privacyAccepted || !termsAccepted) {
      setServerError('Please accept the Privacy Policy and Terms & Conditions.');
      return;
    }

    setErrors({});
    setSubmitting(true);
    let dossierCode = generateDossierCode(
      payload.fullName,
      payload.preferredCommitteeId
    );
    try {
      const apiResp = await apiRequest<{ dossierCode?: string }>(
        '/api/public/applications/delegate',
        {
          method: 'POST',
          skipAuth: true,
          body: {
            full_name: payload.fullName,
            email: payload.email,
            institution: payload.institution,
            country_or_city: payload.countryOrCity,
            delegation_type:
              payload.track === 'delegation'
                ? 'school_delegation'
                : 'single_delegate',
            delegation_size: payload.delegationSize,
            tier,
            experience: payload.experienceLevel,
            motivation_note: payload.motivationNote,
            preferred_committee_id: payload.preferredCommitteeId,
            privacy_policy_accepted: true,
            terms_accepted: true,
          },
        }
      );
      if (apiResp.dossierCode) {
        dossierCode = apiResp.dossierCode;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/not configured/i.test(msg)) {
        setServerError(msg || 'Unable to submit registration.');
        setSubmitting(false);
        return;
      }
    } finally {
      setSubmitting(false);
    }

    const newReceipt: RegistrationReceipt = {
      dossierCode,
      submittedAtIso: new Date().toISOString(),
      payload,
    };
    setReceipt(newReceipt);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newReceipt));
    } catch {
      // Ignore storage quota errors
    }
  };

  const resetDossier = () => {
    setReceipt(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const selectedCommitteeLabel = `${TBA_COMMITTEE_OPTION.code} · ${TBA_COMMITTEE_OPTION.name}`;

  return (
    <section
      id="registration"
      ref={sectionRef}
      className="relative overflow-hidden border-t border-[#263D59]/50 bg-transparent py-28 md:py-36"
    >
      <div className="relative z-10 mx-auto max-w-[1440px] px-6 md:px-10">
        {/* Scroll-Unfolding Open Book Golden SVG Canvas */}
        <div
          className="mx-auto max-w-4xl"
          style={{ perspective: '1200px' }}
        >
          <svg
            viewBox="0 0 820 380"
            className="w-full overflow-visible"
            aria-hidden="true"
          >
            {/* Route descending from above into book spine with ambient glimmer */}
            <path
              ref={bookRouteRef}
              d="M 410 0 L 410 86 M 110 318 L 410 338 L 710 318"
              fill="none"
              stroke="#B89A62"
              strokeWidth="1.35"
            />
            <path
              d="M 410 0 L 410 86"
              fill="none"
              stroke="#E8E1D2"
              strokeWidth="1.8"
              strokeDasharray="6 18"
              className="atlas-ambient-route"
            />

            {/* Left Open Book Folio */}
            <g ref={bookLeftPageRef}>
              <path
                d="M 110 94 C 210 72, 330 76, 408 106 L 408 324 C 330 296, 210 294, 110 312 Z"
                fill="#071426"
                stroke="#B89A62"
                strokeWidth="1.2"
              />
              {[136, 160, 184, 208, 232, 256, 280].map((y) => (
                <path
                  key={`lp-${y}`}
                  d={`M 146 ${y} C 228 ${y - 8}, 314 ${y - 4}, 382 ${y + 10}`}
                  fill="none"
                  stroke="#263D59"
                  strokeWidth="0.9"
                />
              ))}
            </g>

            {/* Right Open Book Folio */}
            <g ref={bookRightPageRef}>
              <path
                d="M 710 94 C 610 72, 490 76, 412 106 L 412 324 C 490 296, 610 294, 710 312 Z"
                fill="#071426"
                stroke="#B89A62"
                strokeWidth="1.2"
              />
              {[136, 160, 184, 208, 232, 256, 280].map((y) => (
                <path
                  key={`rp-${y}`}
                  d={`M 438 ${y + 10} C 506 ${y - 4}, 592 ${y - 8}, 674 ${y}`}
                  fill="none"
                  stroke="#263D59"
                  strokeWidth="0.9"
                />
              ))}
            </g>

            {/* Spine Binding */}
            <line
              x1="410"
              y1="96"
              x2="410"
              y2="338"
              stroke="#D5BD8B"
              strokeWidth="1.6"
            />
          </svg>
        </div>

        {/* Dramatic Destination Statement & Single Primary CTA */}
        <div className="mx-auto mt-6 max-w-3xl text-center md:mt-8">
          <p
            data-reg-stagger
            className="font-mono text-xs tracking-[0.28em] text-[#B89A62] uppercase"
          >
            06 · The Final Destination
          </p>

          <h2
            data-reg-stagger
            className="mt-5 font-display text-5xl leading-[1.02] font-medium text-[#E8E1D2] md:text-7xl"
            style={{ textWrap: 'balance' }}
          >
            YOUR PLACE IN THE WORLD
            <span className="mt-1 block text-[#D5BD8B]">BEGINS HERE.</span>
          </h2>

          <p
            data-reg-stagger
            className="mx-auto mt-6 max-w-xl font-sans text-base leading-relaxed text-[#E8E1D2]/75"
          >
            Submit an individual delegate application or register a school
            delegation for Leadership International School MUN Session I.
          </p>

          <div
            data-reg-stagger
            className="mt-10 flex flex-col items-center justify-center gap-4"
          >
            <button
              type="button"
              onClick={onOpenModal}
              className="atlas-btn-gold inline-flex items-center gap-4 bg-[#071426] px-8 py-4 font-sans text-xs font-medium tracking-[0.2em] text-[#E8E1D2] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
            >
              <span>
                {receipt ? 'Inspect Submitted Dossier' : 'Begin Registration'}
              </span>
              <ArrowRight className="atlas-btn-arrow h-4 w-4 text-[#D5BD8B]" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/apply')}
              className="font-mono text-[11px] tracking-[0.2em] text-[#B89A62] uppercase underline-offset-4 hover:text-[#D5BD8B] hover:underline"
            >
              Apply as Chair, Security, Media/Press, or Volunteers →
            </button>

            {receipt && (
              <p className="font-mono text-[11px] tracking-[0.18em] text-[#D5BD8B]">
                ACTIVE DOSSIER ON FILE · {receipt.dossierCode}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Registration Flow Modal */}
      {isModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-dialog-title"
            className="fixed inset-0 z-[95] flex items-center justify-center bg-[#030914]/92 p-4 md:p-6"
            onClick={onCloseModal}
          >
            <div
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-[#B89A62]/45 bg-[#071426] p-5 md:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#263D59]/70 pb-4">
              <div>
                <p className="font-mono text-[11px] tracking-[0.22em] text-[#B89A62] uppercase">
                  Leadership International School MUN · Session I
                </p>
                <h3
                  id="registration-dialog-title"
                  className="mt-2 font-display text-3xl font-medium text-[#E8E1D2] md:text-4xl"
                >
                  {receipt
                    ? 'Delegate Dossier Recorded'
                    : 'Delegate & Delegation Registry'}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseModal}
                aria-label="Close registration dialog"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-[#263D59] text-[#E8E1D2] hover:border-[#D5BD8B] hover:text-[#D5BD8B]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {receipt ? (
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-3 border border-[#B89A62]/40 bg-[#030914] p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#D5BD8B] text-[#D5BD8B]">
                    <Check className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.18em] text-[#B89A62] uppercase">
                      Archival Reference Code
                    </p>
                    <p className="font-mono text-base font-medium tabular-nums text-[#E8E1D2]">
                      {receipt.dossierCode}
                    </p>
                  </div>
                </div>

                <dl className="grid gap-4 border-y border-[#263D59]/60 py-5 sm:grid-cols-2">
                  <div>
                    <dt className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                      Applicant
                    </dt>
                    <dd className="mt-1 font-sans text-sm text-[#E8E1D2]">
                      {receipt.payload.fullName}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                      Track
                    </dt>
                    <dd className="mt-1 font-sans text-sm text-[#E8E1D2] capitalize">
                      {receipt.payload.track === 'delegation'
                        ? `School Delegation (${receipt.payload.delegationSize} Delegates)`
                        : 'Individual Delegate'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                      Institution
                    </dt>
                    <dd className="mt-1 font-sans text-sm text-[#E8E1D2]">
                      {receipt.payload.institution} · {receipt.payload.countryOrCity}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                      Committee Assignment
                    </dt>
                    <dd className="mt-1 font-sans text-sm text-[#D5BD8B]">
                      {selectedCommitteeLabel}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={resetDossier}
                    className="border border-[#263D59] px-4 py-2.5 font-sans text-xs tracking-[0.14em] text-[#E8E1D2]/80 uppercase hover:border-[#B89A62] hover:text-[#E8E1D2]"
                  >
                    Submit Another Application
                  </button>
                  <button
                    type="button"
                    onClick={onCloseModal}
                    className="atlas-btn-gold bg-[#030914] px-6 py-2.5 font-sans text-xs font-medium tracking-[0.16em] text-[#E8E1D2] uppercase"
                  >
                    Return to Atlas
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3.5">
                {/* Track Switcher */}
                <div className="grid grid-cols-2 border border-[#263D59]">
                  <button
                    type="button"
                    onClick={() => setTrack('individual')}
                    className={`py-3 font-mono text-xs tracking-[0.16em] uppercase transition-colors ${
                      track === 'individual'
                        ? 'bg-[#0D1E36] text-[#D5BD8B]'
                        : 'bg-transparent text-[#E8E1D2]/65 hover:text-[#E8E1D2]'
                    }`}
                  >
                    Individual Delegate
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrack('delegation')}
                    className={`border-l border-[#263D59] py-3 font-mono text-xs tracking-[0.16em] uppercase transition-colors ${
                      track === 'delegation'
                        ? 'bg-[#0D1E36] text-[#D5BD8B]'
                        : 'bg-transparent text-[#E8E1D2]/65 hover:text-[#E8E1D2]'
                    }`}
                  >
                    School Delegation
                  </button>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-fullname"
                      className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                    >
                      Full Name *
                    </label>
                    <input
                      id="reg-fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Delegate or Faculty Advisor"
                      className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2.5 font-sans text-sm text-[#E8E1D2] placeholder-[#E8E1D2]/30 focus:border-[#D5BD8B] focus:outline-none"
                    />
                    {errors.fullName && (
                      <p className="mt-1.5 font-sans text-xs text-[#E57373]">
                        {errors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="reg-email"
                      className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                    >
                      Email Address *
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="delegate@institution.edu"
                      className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2.5 font-sans text-sm text-[#E8E1D2] placeholder-[#E8E1D2]/30 focus:border-[#D5BD8B] focus:outline-none"
                    />
                    {errors.email && (
                      <p className="mt-1.5 font-sans text-xs text-[#E57373]">
                        {errors.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-institution"
                      className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                    >
                      School / University *
                    </label>
                    <input
                      id="reg-institution"
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="Institution Name"
                      className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2.5 font-sans text-sm text-[#E8E1D2] placeholder-[#E8E1D2]/30 focus:border-[#D5BD8B] focus:outline-none"
                    />
                    {errors.institution && (
                      <p className="mt-1.5 font-sans text-xs text-[#E57373]">
                        {errors.institution}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="reg-city"
                      className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                    >
                      City &amp; Country *
                    </label>
                    <input
                      id="reg-city"
                      type="text"
                      value={countryOrCity}
                      onChange={(e) => setCountryOrCity(e.target.value)}
                      placeholder="e.g. London, United Kingdom"
                      className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2.5 font-sans text-sm text-[#E8E1D2] placeholder-[#E8E1D2]/30 focus:border-[#D5BD8B] focus:outline-none"
                    />
                    {errors.countryOrCity && (
                      <p className="mt-1.5 font-sans text-xs text-[#E57373]">
                        {errors.countryOrCity}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-committee"
                      className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                    >
                      Conference Committees *
                    </label>
                    <select
                      id="reg-committee"
                      value={preferredCommitteeId}
                      onChange={(e) => setPreferredCommitteeId(e.target.value)}
                      className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2.5 font-sans text-sm text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
                    >
                      <option value={TBA_COMMITTEE_OPTION.id}>
                        {TBA_COMMITTEE_OPTION.code} — {TBA_COMMITTEE_OPTION.name}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-experience"
                      className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                    >
                      Diplomatic Experience
                    </label>
                    <select
                      id="reg-experience"
                      value={experienceLevel}
                      onChange={(e) =>
                        setExperienceLevel(
                          e.target.value as RegistrationPayload['experienceLevel']
                        )
                      }
                      className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2.5 font-sans text-sm text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
                    >
                      <option value="First Session">First Session</option>
                      <option value="Experienced Delegate">
                        Experienced Delegate
                      </option>
                      <option value="Faculty Advisor">Faculty Advisor</option>
                    </select>
                  </div>
                </div>

                {track === 'delegation' && (
                  <div>
                    <label
                      htmlFor="reg-size"
                      className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                    >
                      Estimated Delegation Size (2–60) *
                    </label>
                    <input
                      id="reg-size"
                      type="number"
                      min={2}
                      max={60}
                      value={delegationSize}
                      onChange={(e) => setDelegationSize(Number(e.target.value))}
                      className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2.5 font-mono text-sm tabular-nums text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
                    />
                    {errors.delegationSize && (
                      <p className="mt-1.5 font-sans text-xs text-[#E57373]">
                        {errors.delegationSize}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="reg-tier"
                    className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                  >
                    Registration Tier
                  </label>
                  <select
                    id="reg-tier"
                    value={tier}
                    onChange={(e) => setTier(e.target.value as 'early_bird' | 'regular')}
                    className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2.5 font-sans text-sm text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
                  >
                    <option value="early_bird">Early Bird Delegate Window</option>
                    <option value="regular">Regular Delegate Window</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="reg-note"
                    className="block font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase"
                  >
                    Country Matrix or Policy Preference (Optional)
                  </label>
                  <textarea
                    id="reg-note"
                    rows={2}
                    value={motivationNote}
                    onChange={(e) => setMotivationNote(e.target.value)}
                    placeholder="Indicate preferred member states or committee notes..."
                    className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3.5 py-2 font-sans text-sm text-[#E8E1D2] placeholder-[#E8E1D2]/30 focus:border-[#D5BD8B] focus:outline-none"
                  />
                </div>

                <div className="space-y-2 border border-[#263D59]/70 bg-[#030914] p-3 text-xs">
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(e) => setPrivacyAccepted(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-[#E8E1D2]/80">
                      I accept the LIS MUN{' '}
                      <a
                        href="/privacy"
                        onClick={(ev) => {
                          ev.preventDefault();
                          navigate('/privacy');
                        }}
                        className="text-[#D5BD8B] underline"
                      >
                        Privacy Policy
                      </a>
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
                    <span className="text-[#E8E1D2]/80">
                      I accept the{' '}
                      <a
                        href="/terms"
                        onClick={(ev) => {
                          ev.preventDefault();
                          navigate('/terms');
                        }}
                        className="text-[#D5BD8B] underline"
                      >
                        Conference Terms &amp; Code of Conduct
                      </a>
                      .
                    </span>
                  </label>
                </div>

                {serverError && (
                  <p className="border border-[#DC2626]/60 bg-[#1B0B10] p-3 text-xs text-[#FCA5A5]">
                    {serverError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-4 border-t border-[#263D59]/70 pt-5">
                  <button
                    type="button"
                    onClick={onCloseModal}
                    className="px-4 py-2.5 font-sans text-xs tracking-[0.14em] text-[#E8E1D2]/70 uppercase hover:text-[#E8E1D2]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="atlas-btn-gold inline-flex items-center gap-3 bg-[#030914] px-6 py-3 font-sans text-xs font-medium tracking-[0.18em] text-[#E8E1D2] uppercase disabled:opacity-50"
                  >
                    <span>{submitting ? 'Submitting...' : 'Submit Dossier'}</span>
                    <ArrowRight className="atlas-btn-arrow h-4 w-4 text-[#D5BD8B]" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
          document.body
        )}
    </section>
  );
};
