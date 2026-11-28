import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  createAtlasScrollContext,
  gsap,
  observeAmbientVisibility,
} from '../utils/atlasAnimations';
import { BritusEmblem } from './BritusEmblem';
import { LaurelWreathAccent, OrnamentalGoldDivider } from './LuxuryOrnaments';

interface PublishedCommittee {
  id: string;
  chamber: string;
  name: string;
  abbreviation: string;
  difficulty: string;
  description: string;
  chair_name: string;
  vice_chair_name: string;
  capacity: number;
}

interface CommitteesSectionProps {
  onRegisterInterest: () => void;
}

export const CommitteesSection: React.FC<CommitteesSectionProps> = ({
  onRegisterInterest,
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const [liveCommittees, setLiveCommittees] = useState<PublishedCommittee[]>([]);

  useEffect(() => {
    fetch('/api/public/overview')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.committees)) {
          setLiveCommittees(data.committees);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const stopAmbient = observeAmbientVisibility(section);
    const stopCtx = createAtlasScrollContext(section, () => {
      gsap.fromTo(
        '[data-committees-stagger]',
        { y: 22, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 78%',
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

  return (
    <section
      id="committees"
      ref={sectionRef}
      className="relative border-t border-[#B89A62]/25 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(131,181,237,0.065),transparent_70%)] bg-[#071426]/42 pt-12 pb-28 md:pt-16 md:pb-36"
    >
      <OrnamentalGoldDivider label="Assembly Councils" className="mb-14 md:mb-20" />
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        <div
          data-committees-stagger
          className="flex flex-col justify-between gap-6 border-b border-[#B89A62]/25 pb-10 lg:flex-row lg:items-end"
        >
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <p className="font-mono text-xs tracking-[0.26em] text-[#83B5ED] uppercase">
                03 · Conference Committees · TBA
              </p>
              <LaurelWreathAccent size={40} />
            </div>
            <h2
              className="mt-3 font-display text-4xl leading-tight font-medium text-[#E8E1D2] md:text-6xl"
              style={{ textWrap: 'balance' }}
            >
              Committees To Be Announced.
            </h2>
          </div>
          <p className="max-w-md font-sans text-sm leading-relaxed text-[#E8E1D2]/75">
            Official council selections, mandates, and study guides for Leadership
            International School MUN Session I will be published upon formal release.
          </p>
        </div>

        {liveCommittees.length > 0 ? (
          <div data-committees-stagger className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {liveCommittees.map((c) => (
              <div
                key={c.id}
                className="atlas-luxury-card flex flex-col justify-between p-7"
              >
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-[#83B5ED] uppercase">
                    {c.abbreviation} · {c.chamber} · {c.difficulty}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-medium text-[#E8E1D2]">
                    {c.name}
                  </h3>
                  <p className="mt-3 font-sans text-xs leading-relaxed text-[#E8E1D2]/75">
                    {c.description}
                  </p>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-[#B89A62]/20 pt-4">
                  <span className="font-mono text-[10px] text-[#D5BD8B] uppercase">
                    Chair: {c.chair_name}
                  </span>
                  <button
                    type="button"
                    onClick={onRegisterInterest}
                    className="font-mono text-[11px] text-[#83B5ED] uppercase transition-colors hover:text-[#D5BD8B]"
                  >
                    Apply →
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Single Unified TBA Announcement Card */
          <div
            data-committees-stagger
            className="atlas-luxury-card mt-14 p-8 md:p-14"
          >
            <div className="grid items-center gap-10 lg:grid-cols-12">
              <div className="flex justify-center lg:col-span-4">
                <div className="relative flex items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(131,181,237,0.16),transparent_68%)] p-4">
                  <BritusEmblem size={172} variant="engraved" animated />
                </div>
              </div>

              <div className="border-t border-[#263D59]/60 pt-8 lg:col-span-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
                <p className="font-mono text-xs tracking-[0.26em] text-[#B89A62] uppercase">
                  Session I Committee Roster
                </p>

                <p className="mt-4 font-display text-6xl leading-none font-medium tracking-[0.06em] text-[#D5BD8B] md:text-7xl">
                  TBA
                </p>

                <h3 className="mt-5 font-display text-3xl font-medium text-[#E8E1D2] md:text-4xl">
                  All Committees Are Currently To Be Announced
                </h3>

                <p className="mt-4 max-w-2xl font-sans text-base leading-relaxed text-[#E8E1D2]/78">
                  The Academic Directorate is finalizing the official lineup of
                  assemblies, specialized councils, and background dossiers. All
                  registered delegates and delegations will receive notice as soon as
                  the committee roster is announced.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-[#263D59]/60 pt-6">
                  <button
                    type="button"
                    onClick={onRegisterInterest}
                    className="atlas-btn-gold inline-flex items-center gap-3 bg-[#071426] px-6 py-3.5 font-sans text-xs font-medium tracking-[0.16em] text-[#E8E1D2] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
                  >
                    <span>Register Early Interest</span>
                    <ArrowRight className="atlas-btn-arrow h-4 w-4 text-[#D5BD8B]" />
                  </button>

                  <span className="font-mono text-xs tracking-[0.18em] text-[#B89A62]/85 uppercase">
                    Status · TBA Ahead of Session I
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
