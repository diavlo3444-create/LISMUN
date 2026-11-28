import React, { useEffect, useRef } from 'react';
import { ArrowDownRight, ArrowRight } from 'lucide-react';
import type { AtlasSectionId } from '../types/atlas';
import {
  createAtlasScrollContext,
  gsap,
  prefersReducedMotion,
  ScrollTrigger,
} from '../utils/atlasAnimations';
import { ThreeMonument } from './ThreeMonument';
import { LaurelWreathAccent } from './LuxuryOrnaments';

interface HeroSectionProps {
  introComplete: boolean;
  introRunId: number;
  onIntroComplete: () => void;
  onNavigate: (sectionId: AtlasSectionId) => void;
  onOpenRegistration: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  introComplete,
  introRunId,
  onIntroComplete,
  onNavigate,
  onOpenRegistration,
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineLine1Ref = useRef<HTMLSpanElement>(null);
  const headlineLine2Ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!introComplete) return;
    ScrollTrigger.refresh();
    const timer = window.setTimeout(() => {
      ScrollTrigger.refresh();
    }, 760);
    return () => window.clearTimeout(timer);
  }, [introComplete]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !introComplete || prefersReducedMotion()) return;

    const stopCtx = createAtlasScrollContext(section, () => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.fromTo(
        '[data-hero-eyebrow]',
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55 },
        0.04
      )
        .fromTo(
          [headlineLine1Ref.current, headlineLine2Ref.current],
          { yPercent: 108, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.1 },
          0.1
        )
        .fromTo(
          '[data-hero-stagger]',
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, stagger: 0.08 },
          0.26
        );
    });

    return () => {
      stopCtx();
    };
  }, [introComplete]);

  return (
    <section
      id="hero"
      ref={sectionRef}
      className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-transparent pt-16 pb-14 lg:pt-24 lg:pb-20"
    >
      {/* Subtle stage scrim + baby-blue/gold ambient backlight behind 3D monument */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-[950ms] ease-out ${
          introComplete
            ? 'bg-[radial-gradient(circle_at_76%_46%,rgba(131,181,237,0.12),rgba(18,39,69,0.22)_34%,transparent_68%)] opacity-100'
            : 'bg-[#030914]/78 opacity-100'
        }`}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 md:px-10">
        <div
          className={`grid items-center lg:grid-cols-12 lg:gap-12 transition-[gap] duration-700 ${
            introComplete ? 'gap-8' : 'gap-0'
          }`}
        >
          {/* Editorial Broadsheet Column (Collapsed below fold on mobile until lock-in; left column on desktop) */}
          <div
            data-testid="hero-editorial-col"
            className={`order-2 lg:order-1 lg:col-span-7 transition-all duration-700 ease-out lg:max-h-none lg:overflow-visible ${
              introComplete
                ? 'max-h-[860px] opacity-100 pointer-events-auto'
                : 'max-h-0 overflow-hidden opacity-0 pointer-events-none'
            }`}
          >
            <div
              data-hero-eyebrow
              className="mb-5 flex items-center gap-3 font-mono text-[11px] tracking-[0.24em] text-[#D5BD8B] uppercase lg:mb-6"
            >
              <span className="h-1.5 w-1.5 rotate-45 bg-[#9E2530] ring-1 ring-[#D5BD8B]/70" aria-hidden="true" />
              <span>LEADERSHIP INTERNATIONAL SCHOOL MUN · SESSION I</span>
            </div>

            <h1
              className="font-display text-4xl leading-[0.98] font-medium tracking-[0.02em] text-[#E8E1D2] sm:text-6xl lg:text-[5.15rem]"
              style={{ textWrap: 'balance' }}
            >
              <span className="block overflow-hidden pb-1">
                <span ref={headlineLine1Ref} className="block">
                  WHERE DIPLOMACY
                </span>
              </span>
              <span className="block overflow-hidden pb-2 text-[#D5BD8B]">
                <span ref={headlineLine2Ref} className="block">
                  MEETS LEGACY.
                </span>
              </span>
            </h1>

            <p
              data-hero-stagger
              className="mt-5 max-w-xl font-sans text-base leading-relaxed text-[#E8E1D2]/78 md:text-lg lg:mt-7"
            >
              An assembly of voices, nations, and ideas shaping the future
              through diplomacy. Navigate a living archive of sovereign debate,
              treaty statecraft, and global inquiry.
            </p>

            <div
              data-hero-stagger
              className="mt-7 flex flex-wrap items-center gap-6 border-t border-[#263D59]/70 pt-6 lg:mt-9 lg:pt-8"
            >
              <button
                type="button"
                onClick={onOpenRegistration}
                className="atlas-btn-gold inline-flex items-center gap-3 bg-[#071426] px-6 py-3.5 font-sans text-xs font-medium tracking-[0.18em] text-[#E8E1D2] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
              >
                <span>Begin Registration</span>
                <ArrowRight className="atlas-btn-arrow h-4 w-4 text-[#D5BD8B]" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('about')}
                className="group inline-flex items-center gap-2 py-2 font-sans text-xs font-medium tracking-[0.16em] text-[#D5BD8B] uppercase transition-colors hover:text-[#E8E1D2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
              >
                <span>Explore the Atlas</span>
                <ArrowDownRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
              </button>
            </div>

            <div
              data-hero-stagger
              className="mt-5 flex items-center gap-3 font-mono text-[11px] tracking-[0.18em] text-[#83B5ED]/85 uppercase lg:mt-6"
            >
              <LaurelWreathAccent size={36} />
              <span>THE LIVING ATLAS · COMMITTEE ROSTER TBA FOR SESSION I</span>
            </div>
          </div>

          {/* Interactive 3D Sculptural LISMUN Monument (Centered first on mobile intro, right column on desktop) */}
          <div className="order-1 lg:order-2 flex flex-col items-center lg:col-span-5 lg:items-end">
            <div className="flex w-full justify-center lg:justify-end">
              <ThreeMonument
                introComplete={introComplete}
                introRunId={introRunId}
                onIntroComplete={onIntroComplete}
                onOpenRegistration={onOpenRegistration}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quiet vertical brass hairline leading downward into About */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-1/2 h-14 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[#B89A62]/45 to-[#B89A62]/70 transition-opacity duration-700 ${
          introComplete ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </section>
  );
};
