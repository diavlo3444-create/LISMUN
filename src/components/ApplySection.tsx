import React from 'react';
import { PublicApplicationPage } from '../client/components/PublicApplicationPage';

export const ApplySection: React.FC = () => {
  return (
    <section
      id="apply"
      className="relative z-[2] border-t border-[#263D59]/55 bg-[#030914]/75 py-24 md:py-32"
    >
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        <div className="mx-auto max-w-4xl pb-10">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#263D59]/60 pb-7">
            <div>
              <p className="font-mono text-xs tracking-[0.26em] text-[#B89A62] uppercase">
                07 · Organizing Team Applications
              </p>
              <h2
                className="mt-4 font-display text-4xl leading-[1.03] font-medium text-[#E8E1D2] md:text-6xl"
                style={{ textWrap: 'balance' }}
              >
                APPLY FOR THE
                <span className="mt-1 block text-[#D5BD8B]">ORGANIZING TEAM.</span>
              </h2>
            </div>
            <p className="max-w-md font-sans text-sm leading-relaxed text-[#E8E1D2]/72">
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
