import React, { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { ATLAS_NAV_ITEMS } from '../data/conferenceData';
import type { AtlasSectionId } from '../types/atlas';
import {
  createAtlasScrollContext,
  gsap,
  observeAmbientVisibility,
} from '../utils/atlasAnimations';
import { BritusEmblem } from './BritusEmblem';
import { navigate } from '../client/router';

interface FooterSectionProps {
  onNavigate: (sectionId: AtlasSectionId) => void;
  onReplayIntro: () => void;
  onOpenRegistration: () => void;
}

export const FooterSection: React.FC<FooterSectionProps> = ({
  onNavigate,
  onReplayIntro,
  onOpenRegistration,
}) => {
  const footerRef = useRef<HTMLElement>(null);
  const emblemContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    const stopAmbient = observeAmbientVisibility(footer);
    const stopCtx = createAtlasScrollContext(footer, () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: footer,
          start: 'top 84%',
          once: true,
        },
      });

      tl.fromTo(
        emblemContainerRef.current,
        { opacity: 0.2, scale: 0.92 },
        { opacity: 1, scale: 1, duration: 0.7, ease: 'power3.out' },
        0
      )
        .fromTo(
          '[data-emblem-part]',
          { opacity: 0, scale: 0.95 },
          { opacity: 1, scale: 1, duration: 0.55, stagger: 0.08, ease: 'power2.out' },
          0.12
        )
        .fromTo(
          '[data-footer-motto]',
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
          0.3
        );
    });

    return () => {
      stopAmbient();
      stopCtx();
    };
  }, []);

  return (
    <footer
      ref={footerRef}
      className="relative z-[2] border-t border-[#B89A62]/30 bg-[#020710] pt-24 pb-12"
    >
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        {/* Return to Origin Emblem Closure */}
        <div
          ref={emblemContainerRef}
          className="flex flex-col items-center border-b border-[#263D59]/60 pb-16 text-center"
        >
          <BritusEmblem
            size={210}
            variant="layered"
            sealOpacity={0.94}
            showCaption
            animated
          />
          <p
            data-footer-motto
            className="mt-6 max-w-md font-display text-2xl italic text-[#D5BD8B]"
          >
            “Where Diplomacy Meets Legacy.”
          </p>
        </div>

        {/* Structured Institutional Footer Columns */}
        <div className="grid gap-10 py-14 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="font-display text-2xl font-semibold tracking-[0.16em] text-[#E8E1D2]">
              LISMUN
            </p>
            <p className="mt-3 max-w-sm font-sans text-sm leading-relaxed text-[#E8E1D2]/68">
              Leadership International School MUN — The Living Atlas. Dedicated
              to classical parliamentary diplomacy, disciplined research, and
              global dialogue.
            </p>
            <button
              type="button"
              onClick={onReplayIntro}
              className="mt-6 inline-flex items-center gap-2 border border-[#263D59] px-4 py-2 font-mono text-[11px] tracking-[0.16em] text-[#D5BD8B] uppercase transition-colors hover:border-[#B89A62] hover:text-[#E8E1D2]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Replay Atlas Intro</span>
            </button>
          </div>

          <div className="md:col-span-3">
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#B89A62] uppercase">
              Atlas Folios
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {ATLAS_NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(item.id);
                    }}
                    className="font-sans text-[#E8E1D2]/75 transition-colors hover:text-[#D5BD8B]"
                  >
                    {item.roman}. {item.label}
                  </a>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={onOpenRegistration}
                  className="font-sans text-[#D5BD8B] transition-colors hover:text-[#E8E1D2]"
                >
                  VI. Delegate Registration
                </button>
              </li>
              <li>
                <a
                  href="#apply"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('apply');
                  }}
                  className="font-sans text-[#D5BD8B] transition-colors hover:text-[#E8E1D2]"
                >
                  VII. Team Member Applications
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4">
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#B89A62] uppercase">
              Secretariat Correspondence
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-mono text-[10px] tracking-[0.18em] text-[#E8E1D2]/50 uppercase">
                  Diplomatic Inquiries
                </dt>
                <dd className="mt-0.5 font-sans text-[#E8E1D2]/70">
                  <span className="font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase">
                    TBA
                  </span>{' '}
                  <span className="text-xs text-[#E8E1D2]/55">
                    · Forthcoming
                  </span>
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.18em] text-[#E8E1D2]/50 uppercase">
                  Delegate Relations
                </dt>
                <dd className="mt-0.5 font-sans text-[#E8E1D2]/70">
                  <span className="font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase">
                    TBA
                  </span>{' '}
                  <span className="text-xs text-[#E8E1D2]/55">
                    · Forthcoming
                  </span>
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.18em] text-[#E8E1D2]/50 uppercase">
                  Conference Session
                </dt>
                <dd className="mt-0.5 font-sans text-[#E8E1D2]/70">
                  Inaugural Session I · Official Calendar &amp; Venue Forthcoming
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#263D59]/45 pt-8 font-mono text-[11px] tracking-[0.14em] text-[#E8E1D2]/45 sm:flex-row">
          <p>© {new Date().getFullYear()} Leadership International School MUN.</p>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a
              href="#apply"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('apply');
              }}
              className="hover:text-[#D5BD8B]"
            >
              Team Member Applications
            </a>
            <a
              href="/portal"
              onClick={(e) => {
                e.preventDefault();
                navigate('/portal');
              }}
              className="hover:text-[#D5BD8B]"
            >
              Management Portal
            </a>
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                navigate('/privacy');
              }}
              className="hover:text-[#D5BD8B]"
            >
              Privacy
            </a>
            <a
              href="/terms"
              onClick={(e) => {
                e.preventDefault();
                navigate('/terms');
              }}
              className="hover:text-[#D5BD8B]"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
