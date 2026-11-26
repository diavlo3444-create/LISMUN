import { useCallback, useEffect, useState } from 'react';
import { AboutSection } from './components/AboutSection';
import { ApplySection } from './components/ApplySection';
import { CartographicCursor } from './components/CartographicCursor';
import { CommitteesSection } from './components/CommitteesSection';
import { ExperienceSection } from './components/ExperienceSection';
import { FooterSection } from './components/FooterSection';
import { HeroSection } from './components/HeroSection';
import { Navbar } from './components/Navbar';
import { NumbersSection } from './components/NumbersSection';
import { RegistrationSection } from './components/RegistrationSection';
import { ScrollAtlasBackdrop } from './components/ScrollAtlasBackdrop';
import { SecretariatSection } from './components/SecretariatSection';
import type { AtlasSectionId } from './types/atlas';
import {
  ensureGsapRegistered,
  prefersReducedMotion,
  ScrollTrigger,
} from './utils/atlasAnimations';

const SECTION_ORDER: AtlasSectionId[] = [
  'hero',
  'about',
  'experience',
  'committees',
  'secretariat',
  'numbers',
  'registration',
  'apply',
];

function shouldBypassIntroOnLoad(): boolean {
  if (typeof window === 'undefined') return true;
  if (prefersReducedMotion()) return true;
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') return true;
  return false;
}

export default function App() {
  const [introComplete, setIntroComplete] = useState<boolean>(() =>
    shouldBypassIntroOnLoad()
  );
  const [introRunId, setIntroRunId] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<AtlasSectionId>('hero');
  const [registrationModalOpen, setRegistrationModalOpen] =
    useState<boolean>(false);

  useEffect(() => {
    ensureGsapRegistered();
    if (introComplete) {
      const timer = window.setTimeout(() => {
        ScrollTrigger.refresh();
      }, 120);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [introComplete]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id as AtlasSectionId;
            if (SECTION_ORDER.includes(id)) {
              setActiveSection(id);
            }
          }
        }
      },
      {
        rootMargin: '-35% 0px -45% 0px',
        threshold: 0.01,
      }
    );

    for (const id of SECTION_ORDER) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [introComplete]);

  const navigateToSection = useCallback((sectionId: AtlasSectionId) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
    setActiveSection(sectionId);
  }, []);

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  const handleReplayIntro = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setActiveSection('hero');
    setIntroComplete(false);
    setIntroRunId((n) => n + 1);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#030914] text-[#E8E1D2]">
      <ScrollAtlasBackdrop
        activeSection={activeSection}
        dimmed={!introComplete}
      />

      <CartographicCursor />

      <Navbar
        activeSection={activeSection}
        visible={introComplete}
        onNavigate={navigateToSection}
        onOpenRegistration={() => setRegistrationModalOpen(true)}
      />

      <main className="relative z-[2]">
        <HeroSection
          introComplete={introComplete}
          introRunId={introRunId}
          onIntroComplete={handleIntroComplete}
          onNavigate={navigateToSection}
          onOpenRegistration={() => setRegistrationModalOpen(true)}
        />

        <AboutSection />

        <ExperienceSection />

        <CommitteesSection
          onRegisterInterest={() => setRegistrationModalOpen(true)}
        />

        <SecretariatSection />

        <NumbersSection />

        <RegistrationSection
          isModalOpen={registrationModalOpen}
          preselectedCommitteeId="tba"
          onOpenModal={() => setRegistrationModalOpen(true)}
          onCloseModal={() => setRegistrationModalOpen(false)}
          onApplyNavigate={() => navigateToSection('apply')}
        />

        <ApplySection />
      </main>

      <FooterSection
        onNavigate={navigateToSection}
        onReplayIntro={handleReplayIntro}
        onOpenRegistration={() => setRegistrationModalOpen(true)}
      />
    </div>
  );
}
