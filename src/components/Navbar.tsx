import React, { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ATLAS_NAV_ITEMS } from '../data/conferenceData';
import type { AtlasSectionId } from '../types/atlas';

interface NavbarProps {
  activeSection: AtlasSectionId;
  visible?: boolean;
  onNavigate: (sectionId: AtlasSectionId) => void;
  onOpenRegistration: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeSection,
  visible = true,
  onNavigate,
  onOpenRegistration,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const progressMarkerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;

    const syncBar = () => {
      rafId = 0;
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll));

      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${Math.max(0.02, ratio)})`;
      }
      if (progressMarkerRef.current && progressTrackRef.current) {
        const trackWidth = progressTrackRef.current.clientWidth || window.innerWidth;
        const px = Math.min(trackWidth - 8, Math.max(8, ratio * trackWidth));
        progressMarkerRef.current.style.transform = `translate3d(${px}px, -50%, 0) rotate(45deg)`;
      }
    };

    const onScroll = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(syncBar);
      }
    };

    syncBar();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const handleLinkClick = (id: AtlasSectionId) => {
    setMobileOpen(false);
    onNavigate(id);
  };

  return (
    <header
      data-testid="atlas-navbar"
      className={`fixed inset-x-0 top-0 z-40 border-b border-[#263D59]/55 bg-[#030914]/96 transition-all duration-700 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : '-translate-y-2 opacity-0 pointer-events-none'
      }`}
    >
      {/* Strict 3-Zone Top Bar Contract: Wordmark — 5 Nav Links — 1 Primary Action */}
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-6 md:px-10">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#hero"
          onClick={(e) => {
            e.preventDefault();
            handleLinkClick('hero');
          }}
          className="font-display text-xl font-semibold tracking-[0.18em] text-[#E8E1D2] whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
        >
          LISMUN
        </a>

        {/* Zone 2: 5 Concise Single-Line Section Links */}
        <nav
          aria-label="Primary Atlas Navigation"
          className="hidden items-center gap-7 md:flex"
        >
          {ATLAS_NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleLinkClick(item.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative py-1 font-sans text-xs font-medium tracking-[0.14em] uppercase whitespace-nowrap shrink-0 transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B] ${
                  isActive
                    ? 'text-[#D5BD8B]'
                    : 'text-[#E8E1D2]/72 hover:text-[#E8E1D2]'
                }`}
              >
                <span>{item.label}</span>
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 -bottom-0.5 h-px origin-left bg-[#D5BD8B] transition-transform duration-300 ${
                    isActive
                      ? 'scale-x-100'
                      : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                />
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action + Mobile Trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onOpenRegistration();
            }}
            className="atlas-btn-gold bg-[#071426] px-4 py-2 font-sans text-xs font-medium tracking-[0.14em] text-[#E8E1D2] uppercase whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
          >
            Register
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-10 w-10 items-center justify-center border border-[#263D59] text-[#E8E1D2] md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Traveling Golden Cartographic Progress Route */}
      <div
        ref={progressTrackRef}
        aria-hidden="true"
        className="relative h-[2px] w-full bg-[#263D59]/35"
      >
        <div
          ref={progressBarRef}
          className="h-full origin-left bg-gradient-to-r from-[#B89A62] to-[#D5BD8B]"
          style={{ transform: 'scaleX(0.02)' }}
        />
        <div
          ref={progressMarkerRef}
          className="absolute top-1/2 left-0 h-2 w-2 -ml-1 border border-[#D5BD8B] bg-[#030914]"
          style={{ transform: 'translate3d(8px, -50%, 0) rotate(45deg)' }}
        />
      </div>

      {/* Minimal Mobile Navigation Drawer */}
      {mobileOpen && (
        <nav
          aria-label="Mobile Atlas Navigation"
          className="border-t border-[#263D59]/60 bg-[#030914] px-6 py-5 md:hidden"
        >
          <ul className="flex flex-col divide-y divide-[#263D59]/40">
            {ATLAS_NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleLinkClick(item.id);
                    }}
                    className={`flex items-center justify-between py-3.5 text-sm tracking-[0.12em] uppercase ${
                      isActive ? 'text-[#D5BD8B]' : 'text-[#E8E1D2]/80'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="font-mono text-[11px] text-[#B89A62]/75">
                      {item.roman}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
};
