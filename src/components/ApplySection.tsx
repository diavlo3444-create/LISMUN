import React from 'react';
import { PublicApplicationPage } from '../client/components/PublicApplicationPage';
import { LaurelWreathAccent, OrnamentalGoldDivider } from './LuxuryOrnaments';

export const ApplySection: React.FC = () => {
  return (
    <section
      id="apply"
      className="relative z-[2] border-t border-[#B89A62]/30 bg-[radial-gradient(ellipse_75%_45%_at_50%_0%,rgba(131,181,237,0.085),transparent_68%)] bg-[#030914]/82 pt-12 pb-24 md:pt-16 md:pb-32"
    >
      <OrnamentalGoldDivider label="Secretariat & Staff Recruitment" className="mb-14 md:mb-18" />
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        <div className="mx-auto max-w-4xl pb-10">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#B89A62]/30 pb-7">
            <div>
              <div className="flex items-center gap-3">
                <p className="font-mono text-xs tracking-[0.26em] text-[#83B5ED] uppercase">
                  07 · Organizing Team Applications
                </p>
                <LaurelWreathAccent size={40} />
              </div>
              <h2
                className="mt-3 font-display text-4xl leading-[1.03] font-medium text-[#E8E1D2] md:text-6xl"
                style={{ textWrap: 'balance' }}
              >
                APPLY FOR THE
                <span className="mt-1 block text-[#D5BD8B]">ORGANIZING TEAM.</span>
              </h2>
            </div>
            <p className="max-w-md font-sans text-sm leading-relaxed text-[#E8E1D2]/75">
              Apply below to join the Media, Volunteers, Press, or Security
              teams for Leadership International School MUN Session I without
              leaving the conference page.
            </p>
          </div>
        </div>

        <PublicApplicationPage embedded />
      </div>
    </section>
  );
};
