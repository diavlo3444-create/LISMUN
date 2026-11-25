import React, { useEffect, useRef } from 'react';
import { ATLAS_LEDGER_METRICS } from '../data/conferenceData';
import {
  createAtlasScrollContext,
  gsap,
  prefersReducedMotion,
} from '../utils/atlasAnimations';

export const NumbersSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || prefersReducedMotion()) return;

    return createAtlasScrollContext(section, () => {
      const items = gsap.utils.toArray<HTMLElement>('[data-metric-row]');
      items.forEach((row) => {
        const numberEl = row.querySelector<HTMLElement>('[data-count-target]');
        const lineEl = row.querySelector<HTMLElement>('[data-metric-line]');
        const detailEls = row.querySelectorAll<HTMLElement>('[data-metric-detail]');

        if (numberEl) {
          const rawTarget = numberEl.dataset.countTarget;
          const target = rawTarget ? Number(rawTarget) : NaN;

          if (!Number.isNaN(target) && target > 0) {
            const counter = { val: 0 };
            gsap.fromTo(
              numberEl,
              { scale: 0.92, opacity: 0.25 },
              {
                scale: 1,
                opacity: 1,
                duration: 0.65,
                ease: 'power3.out',
                scrollTrigger: {
                  trigger: row,
                  start: 'top 84%',
                  once: true,
                },
              }
            );

            gsap.to(counter, {
              val: target,
              duration: 0.85,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: row,
                start: 'top 84%',
                once: true,
              },
              onUpdate: () => {
                const rounded = Math.round(counter.val);
                if (numberEl.dataset.roman === 'true') {
                  numberEl.textContent = rounded >= 1 ? 'I' : '0';
                } else {
                  numberEl.textContent = String(rounded).padStart(2, '0');
                }
              },
            });
          }
        }

        if (lineEl) {
          gsap.fromTo(
            lineEl,
            { scaleX: 0 },
            {
              scaleX: 1,
              duration: 0.75,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: row,
                start: 'top 84%',
                once: true,
              },
            }
          );
        }

        if (detailEls.length > 0) {
          gsap.fromTo(
            detailEls,
            { x: 16, opacity: 0 },
            {
              x: 0,
              opacity: 1,
              duration: 0.65,
              stagger: 0.08,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: row,
                start: 'top 84%',
                once: true,
              },
            }
          );
        }
      });
    });
  }, []);

  return (
    <section
      id="numbers"
      ref={sectionRef}
      className="relative border-t border-[#263D59]/50 bg-[#040D1B]/32 py-28 md:py-36"
    >
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        <div className="max-w-2xl pb-16">
          <p className="font-mono text-xs tracking-[0.26em] text-[#B89A62] uppercase">
            05 · LISMUN in Numbers
          </p>
          <h2
            className="mt-4 font-display text-4xl leading-tight font-medium text-[#E8E1D2] md:text-6xl"
            style={{ textWrap: 'balance' }}
          >
            The Sovereign Ledger.
          </h2>
        </div>

        {/* Monumental Typographic Rows — Zero Cards */}
        <div className="divide-y divide-[#263D59]/50 border-t border-[#263D59]/50">
          {ATLAS_LEDGER_METRICS.map((metric) => (
            <div
              key={metric.id}
              data-metric-row="true"
              className="grid items-end gap-8 py-14 lg:grid-cols-12"
            >
              {/* Massive Serif Value */}
              <div className="lg:col-span-4">
                {metric.romanLabel && (
                  <p className="mb-1 font-mono text-[11px] tracking-[0.24em] text-[#B89A62] uppercase">
                    {metric.romanLabel}
                  </p>
                )}
                <p
                  data-count-target={metric.value ?? undefined}
                  data-roman={metric.id === 'session-roman' ? 'true' : 'false'}
                  className="font-display text-7xl leading-none font-medium tabular-nums text-[#D5BD8B] md:text-8xl lg:text-[6.75rem]"
                >
                  {metric.displayFallback}
                </p>
                {/* Animated Gold Route Line Drawing Underneath */}
                <div
                  data-metric-line="true"
                  aria-hidden="true"
                  className="mt-5 h-px w-full origin-left bg-gradient-to-r from-[#D5BD8B] via-[#B89A62]/70 to-transparent"
                />
              </div>

              {/* Description & Verification Ledger */}
              <div data-metric-detail className="lg:col-span-5 lg:col-start-6">
                <h3 className="font-display text-3xl font-medium text-[#E8E1D2]">
                  {metric.label}
                </h3>
                <p className="mt-3 font-sans text-base leading-relaxed text-[#E8E1D2]/76">
                  {metric.detail}
                </p>
              </div>

              <div data-metric-detail className="lg:col-span-2 lg:text-right">
                <span className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62]/85 uppercase">
                  {metric.verifiedNote}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
