import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { SECRETARIAT_OFFICES } from '../data/conferenceData';
import type { SecretariatOffice } from '../types/atlas';
import {
  createAtlasScrollContext,
  gsap,
  observeAmbientVisibility,
} from '../utils/atlasAnimations';
import { SecretariatPlinthPlate } from './CartographicPlates';

const ROMAN_INDICES = ['I', 'II', 'III', 'IV', 'V'];

export const SecretariatSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeOffice, setActiveOffice] = useState<SecretariatOffice | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const stopAmbient = observeAmbientVisibility(section);
    const stopCtx = createAtlasScrollContext(section, () => {
      gsap.fromTo(
        '[data-secretariat-header]',
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.65,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            once: true,
          },
        }
      );

      gsap.fromTo(
        '[data-secretariat-card]',
        { y: 28, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 72%',
            once: true,
          },
        }
      );
    });

    return () => {
      stopAmbient();
      stopCtx();
    };
  }, []);

  const activeIdx = activeOffice
    ? SECRETARIAT_OFFICES.findIndex((o) => o.id === activeOffice.id)
    : -1;

  const stepOffice = (delta: number) => {
    if (activeIdx === -1) return;
    const nextIdx =
      (activeIdx + delta + SECRETARIAT_OFFICES.length) %
      SECRETARIAT_OFFICES.length;
    setActiveOffice(SECRETARIAT_OFFICES[nextIdx]);
  };

  return (
    <section
      id="secretariat"
      ref={sectionRef}
      className="relative border-t border-[#263D59]/50 bg-transparent py-28 md:py-36"
    >
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        {/* Institutional Header */}
        <div
          data-secretariat-header
          className="flex flex-col justify-between gap-6 border-b border-[#263D59]/60 pb-10 lg:flex-row lg:items-end"
        >
          <div className="max-w-2xl">
            <p className="font-mono text-xs tracking-[0.26em] text-[#B89A62] uppercase">
              04 · The Archive of People
            </p>
            <h2
              className="mt-4 font-display text-4xl leading-tight font-medium text-[#E8E1D2] md:text-6xl"
              style={{ textWrap: 'balance' }}
            >
              The Institutional Secretariat.
            </h2>
          </div>
          <p className="max-w-md font-sans text-sm leading-relaxed text-[#E8E1D2]/72">
            An archival index of the executive offices stewarding Leadership
            International School MUN. Inspect any plate to read its constitutional
            portfolio and Session I appointment status.
          </p>
        </div>

        {/* Asymmetrical Archive Grid */}
        <div className="mt-14 grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-12">
          {SECRETARIAT_OFFICES.map((office, idx) => {
            const isHovered = hoveredId === office.id;
            const spanClass =
              idx === 0
                ? 'lg:col-span-4'
                : idx === 1
                ? 'lg:col-span-4 lg:mt-14'
                : idx === 2
                ? 'lg:col-span-4 lg:mt-6'
                : idx === 3
                ? 'lg:col-span-5 lg:col-start-2'
                : 'lg:col-span-5 lg:mt-10';

            return (
              <article
                key={office.id}
                data-secretariat-card
                className={spanClass}
              >
                <button
                  type="button"
                  onClick={() => setActiveOffice(office)}
                  onMouseEnter={() => setHoveredId(office.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="group block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
                >
                  {/* Monochrome -> Gold Archive Portrait Plate */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden border border-[#263D59]/80 bg-[#071426] transition-colors duration-300 group-hover:border-[#D5BD8B]">
                    <div
                      className={`h-full w-full transition-all duration-500 ${
                        isHovered ? 'scale-[1.03] saturate-100' : 'grayscale-[55%]'
                      }`}
                    >
                      <SecretariatPlinthPlate
                        accessionCode={office.accessionCode}
                        romanNumeral={ROMAN_INDICES[idx] ?? 'I'}
                        isActive={isHovered}
                      />
                    </div>

                    {/* Fine Gold Framing Overlay Line on Hover */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-3 border border-[#D5BD8B]/0 transition-all duration-300 group-hover:border-[#D5BD8B]/45"
                    />

                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-[#263D59]/60 bg-[#030914]/90 px-4 py-2.5 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase whitespace-nowrap">
                      <span className="truncate">{office.accessionCode}</span>
                      <span className="shrink-0 text-[#E8E1D2]/70 transition-colors group-hover:text-[#D5BD8B]">
                        Inspect →
                      </span>
                    </div>
                  </div>

                  {/* Editorial Label */}
                  <div className="mt-5">
                    <p className="font-mono text-[11px] tracking-[0.18em] text-[#B89A62] uppercase">
                      {office.division}
                    </p>
                    <h3 className="mt-1.5 font-display text-2xl font-medium text-[#E8E1D2] transition-colors group-hover:text-[#D5BD8B] md:text-3xl">
                      {office.title}
                    </h3>
                    <p className="mt-2 font-sans text-xs tracking-wide text-[#E8E1D2]/60">
                      {office.appointmentStatus}
                    </p>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      </div>

      {/* Archival Dossier Detail Slide-Over */}
      {activeOffice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="secretariat-dossier-title"
          className="fixed inset-0 z-50 flex justify-end bg-[#030914]/90"
          onClick={() => setActiveOffice(null)}
        >
          <div
            className="flex h-full w-full max-w-xl flex-col justify-between overflow-y-auto border-l border-[#B89A62]/40 bg-[#071426] p-8 md:p-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between border-b border-[#263D59]/70 pb-5">
                <span className="font-mono text-xs tracking-[0.2em] text-[#B89A62] uppercase">
                  {activeOffice.accessionCode}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveOffice(null)}
                  aria-label="Close Secretariat Dossier"
                  className="inline-flex h-10 w-10 items-center justify-center border border-[#263D59] text-[#E8E1D2] transition-colors hover:border-[#D5BD8B] hover:text-[#D5BD8B]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-8 font-mono text-[11px] tracking-[0.2em] text-[#D5BD8B] uppercase">
                {activeOffice.division} · {activeOffice.coordinates}
              </p>

              <h3
                id="secretariat-dossier-title"
                className="mt-3 font-display text-4xl leading-tight font-medium text-[#E8E1D2]"
              >
                {activeOffice.title}
              </h3>

              <p className="mt-2 font-display text-lg italic text-[#B89A62]">
                “{activeOffice.motto}”
              </p>

              <p className="mt-6 border-t border-[#263D59]/60 pt-6 font-sans text-base leading-relaxed text-[#E8E1D2]/85">
                {activeOffice.portfolio}
              </p>

              <div className="mt-8">
                <p className="font-mono text-[10px] tracking-[0.22em] text-[#B89A62] uppercase">
                  Constitutional Mandate
                </p>
                <ul className="mt-4 divide-y divide-[#263D59]/50 border-y border-[#263D59]/50">
                  {activeOffice.responsibilities.map((item) => (
                    <li
                      key={item}
                      className="py-3.5 font-sans text-sm text-[#E8E1D2]/85"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 border border-[#B89A62]/30 bg-[#030914] p-5">
                <p className="font-mono text-[10px] tracking-[0.2em] text-[#D5BD8B] uppercase">
                  Registry Status
                </p>
                <p className="mt-1.5 font-sans text-sm text-[#E8E1D2]/80">
                  {activeOffice.appointmentStatus}. Verified officeholder portrait
                  and biography will be inscribed into this folio upon official
                  Secretariat announcement.
                </p>
              </div>
            </div>

            {/* Prev / Next Archive Navigation */}
            <div className="mt-10 flex items-center justify-between border-t border-[#263D59]/70 pt-6">
              <button
                type="button"
                onClick={() => stepOffice(-1)}
                className="inline-flex items-center gap-2 py-2 font-mono text-xs tracking-[0.16em] text-[#E8E1D2]/80 uppercase hover:text-[#D5BD8B]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Previous Folio</span>
              </button>
              <button
                type="button"
                onClick={() => stepOffice(1)}
                className="inline-flex items-center gap-2 py-2 font-mono text-xs tracking-[0.16em] text-[#E8E1D2]/80 uppercase hover:text-[#D5BD8B]"
              >
                <span>Next Folio</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
