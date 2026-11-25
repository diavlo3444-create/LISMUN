import React, { useEffect, useRef, useState } from 'react';
import { ABOUT_CHAPTERS } from '../data/conferenceData';
import {
  createAtlasScrollContext,
  gsap,
  ScrollTrigger,
} from '../utils/atlasAnimations';
import { MeridianOceanCanvas } from './MeridianOceanCanvas';

export const AboutSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const stopCtx = createAtlasScrollContext(section, () => {
      // Section header kinetic reveal
      gsap.fromTo(
        '[data-about-header]',
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            once: true,
          },
        }
      );

      // Chapter scroll observer + staggered editorial reveals
      const chapterEls = gsap.utils.toArray<HTMLElement>('[data-about-chapter]');
      chapterEls.forEach((el, idx) => {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 72%',
          end: 'bottom 28%',
          onToggle: (self) => {
            if (self.isActive) {
              setActiveChapterIdx(idx);
            }
          },
        });

        const revealItems = el.querySelectorAll('[data-chapter-reveal]');
        gsap.fromTo(
          el,
          { opacity: 0.15, y: 24 },
          {
            opacity: 1,
            y: 0,
            duration: 0.65,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 84%',
              once: true,
            },
          }
        );

        if (revealItems.length > 0) {
          gsap.fromTo(
            revealItems,
            { y: 12, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.5,
              stagger: 0.07,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: el,
                start: 'top 82%',
                once: true,
              },
            }
          );
        }
      });
    });

    return () => {
      stopCtx();
    };
  }, []);

  const activeChapter =
    ABOUT_CHAPTERS[activeChapterIdx] ?? ABOUT_CHAPTERS[0];

  return (
    <section
      id="about"
      ref={sectionRef}
      className="relative border-t border-[#263D59]/45 bg-[#040D1B]/25"
    >
      {/* Sticky Procedural Golden Meridian Currents & Ocean Waves Stage */}
      <div className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden">
        <MeridianOceanCanvas activeChapterIdx={activeChapterIdx} />

        {/* Readability vignette over flowing meridian currents */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#030914]/76 via-[#030914]/38 to-[#030914]/14"
          aria-hidden="true"
        />

        {/* Bottom-right live coordinate readout */}
        <div className="pointer-events-none absolute right-6 bottom-6 hidden border border-[#B89A62]/30 bg-[#030914]/85 px-4 py-2.5 md:block">
          <p className="font-mono text-[10px] tracking-[0.22em] text-[#B89A62] uppercase">
            ACTIVE MERIDIAN · {activeChapter.roman}
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-[#E8E1D2]/90">
            {activeChapter.coordinates}
          </p>
        </div>
      </div>

      {/* Scrollable Editorial Chapters Layered Over the Moving Ocean Currents */}
      <div className="relative z-10 -mt-[calc(100vh-4rem)] pb-24">
        <div className="mx-auto max-w-[1440px] px-6 pt-20 md:px-10">
          <div className="max-w-xl">
            <p
              data-about-header
              className="font-mono text-xs tracking-[0.26em] text-[#B89A62] uppercase"
            >
              01 · Exploring the World
            </p>
            <h2
              data-about-header
              className="mt-4 font-display text-4xl leading-tight font-medium text-[#E8E1D2] md:text-6xl"
              style={{ textWrap: 'balance' }}
            >
              A Conference Mapped Across Sovereign Horizons.
            </h2>
          </div>

          <div className="mt-16 flex flex-col gap-36 md:gap-48">
            {ABOUT_CHAPTERS.map((chapter, idx) => (
              <article
                key={chapter.id}
                data-about-chapter="true"
                className={`max-w-xl border-t border-[#B89A62]/40 bg-[#030914]/92 p-7 md:p-9 ${
                  idx % 2 === 1 ? 'md:ml-auto lg:mr-16' : ''
                }`}
              >
                <div
                  data-chapter-reveal
                  className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tracking-[0.2em] text-[#B89A62] uppercase"
                >
                  <span>
                    {chapter.roman} · {chapter.regionLabel}
                  </span>
                  <span className="tabular-nums text-[#E8E1D2]/60">
                    {chapter.coordinates}
                  </span>
                </div>

                <h3
                  data-chapter-reveal
                  className="mt-4 font-display text-3xl font-medium text-[#E8E1D2] md:text-4xl"
                >
                  {chapter.title}
                </h3>
                <p
                  data-chapter-reveal
                  className="mt-1 font-display text-lg italic text-[#D5BD8B]"
                >
                  {chapter.subtitle}
                </p>

                <p
                  data-chapter-reveal
                  className="mt-5 font-sans text-base leading-relaxed text-[#E8E1D2]/80"
                >
                  {chapter.body}
                </p>

                <p
                  data-chapter-reveal
                  className="mt-6 border-t border-[#263D59]/60 pt-4 font-serif text-xs italic text-[#E8E1D2]/60"
                >
                  {chapter.caption}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
