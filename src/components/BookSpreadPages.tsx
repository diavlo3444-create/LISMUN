import React from 'react';
import type { ExperienceStage } from '../types/atlas';
import { BritusEmblem } from './BritusEmblem';

/**
 * Embossed Dark Navy Morocco Leather Front Cover (Text & Vector Crest Only)
 */
export const FrontCoverFace: React.FC = () => {
  return (
    <div className="book-leather-surface relative flex h-full w-full flex-col justify-between overflow-hidden rounded-r-[6px] border border-[#B89A62]/45 p-6 sm:p-8 lg:p-9 shadow-[inset_10px_0_20px_rgba(0,0,0,0.6),0_18px_40px_rgba(0,0,0,0.65)]">
      {/* Spine hinge creasing */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-[#02060D] via-[#0A192F]/75 to-transparent"
      />

      {/* Embossed Outer Double Gold Rule */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-4 border border-[#B89A62]/45"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-5.5 border border-[#B89A62]/20"
      />

      {/* Top Cover Inscription */}
      <div className="relative z-10 px-4 pt-1 pl-5 text-center">
        <p className="font-mono text-[8.5px] leading-snug tracking-[0.22em] text-[#B89A62]/90 uppercase sm:text-[9.5px]">
          LEADERSHIP INTERNATIONAL SCHOOL MUN
        </p>
        <div className="mx-auto mt-2 h-px w-20 bg-[#B89A62]/45" />
      </div>

      {/* Central Engraved Vector Crest & Title */}
      <div className="relative z-10 my-auto flex flex-col items-center pl-3 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[#B89A62]/45 bg-[#040D1B] p-1.5 sm:h-24 sm:w-24">
          <BritusEmblem size={72} variant="engraved" />
        </div>

        <p className="mt-4 font-mono text-[9px] tracking-[0.28em] text-[#B89A62] uppercase">
          LIBER PRIMUS · FOLIO ARCHIVE
        </p>

        <h3 className="mt-1.5 font-display text-2xl leading-tight font-medium tracking-[0.06em] text-[#D5BD8B] sm:text-3xl xl:text-[2.15rem]">
          THE DELEGATE
          <span className="block text-[#E8E1D2]">CHRONICLE</span>
        </h3>

        <p className="mt-2.5 max-w-[240px] font-serif text-xs italic text-[#E8E1D2]/70 sm:text-sm">
          Four Movements of Parliamentary Statecraft
        </p>
      </div>

      {/* Bottom Embossed Imprint */}
      <div className="relative z-10 pb-1 pl-3 text-center">
        <div className="mx-auto mb-2 h-px w-24 bg-[#B89A62]/35" />
        <p className="font-mono text-[9px] tracking-[0.26em] text-[#B89A62]/80 uppercase">
          SESSION I · SCROLL TO OPEN
        </p>
      </div>
    </div>
  );
};

/**
 * Left-hand editorial book page: Chapter Title + Classical Drop-Cap Narrative Prose
 */
export const SpreadLeftPage: React.FC<{ stage: ExperienceStage }> = ({
  stage,
}) => {
  const pageNumber = String(Number(stage.index) * 2 - 1).padStart(2, '0');

  return (
    <div className="book-ivory-paper relative flex h-full w-full flex-col justify-between overflow-hidden rounded-l-[3px] border border-[#C9BEA8] p-5 sm:p-6 xl:p-8">
      {/* Subtle engraved cartographic watermark lines */}
      {stage.id === 'research' && (
        <svg
          viewBox="0 0 360 480"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
        >
          <circle
            cx="265"
            cy="355"
            r="96"
            fill="none"
            stroke="#263D59"
            strokeWidth="0.9"
            strokeDasharray="3 4"
          />
          <circle
            cx="265"
            cy="355"
            r="64"
            fill="none"
            stroke="#7A6136"
            strokeWidth="0.7"
          />
        </svg>
      )}

      {stage.id === 'diplomacy' && (
        <svg
          viewBox="0 0 360 480"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
        >
          <path
            d="M 24 410 C 120 330, 230 390, 336 300"
            fill="none"
            stroke="#7A6136"
            strokeWidth="1.1"
          />
          <path
            d="M 40 350 C 140 310, 210 340, 318 260"
            fill="none"
            stroke="#263D59"
            strokeWidth="0.8"
            strokeDasharray="3 4"
          />
        </svg>
      )}

      {/* Inner page frame & subtle gutter spine shadow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-2.5 border border-[#263D59]/18"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#141D2B]/18 via-[#141D2B]/05 to-transparent"
      />

      {/* Running Header */}
      <header className="relative z-10 flex items-center justify-between gap-2 border-b border-[#263D59]/22 pb-2 pr-2 font-mono text-[8.5px] tracking-[0.14em] text-[#5B5243] uppercase xl:text-[9.5px]">
        <span className="truncate">{stage.folioCode}</span>
        <span className="shrink-0 text-[#7A6136]">{stage.coordinate}</span>
      </header>

      {/* Left-Page Editorial Title & Drop-Cap Prose */}
      <div className="relative z-10 my-auto py-3 pr-3">
        <p className="font-mono text-[9px] tracking-[0.2em] text-[#7A6136] uppercase xl:text-[10px]">
          Chapter {stage.roman} — {stage.subtitle}
        </p>

        <h3 className="mt-2 font-display text-3xl leading-[1.02] font-semibold tracking-[0.01em] text-[#0D1829] sm:text-4xl xl:text-[2.75rem]">
          {stage.title}
        </h3>

        <div className="my-4 h-px w-16 bg-[#7A6136]/45" />

        <p className="max-w-[44ch] font-serif text-[14.5px] leading-[1.68] text-[#222B38] first-letter:float-left first-letter:mr-2.5 first-letter:mt-1 first-letter:font-display first-letter:text-4xl first-letter:leading-none first-letter:font-semibold first-letter:text-[#7A6136] sm:text-[15.5px] xl:text-[17px] xl:leading-[1.72] xl:first-letter:text-5xl">
          {stage.description}
        </p>

        <p className="mt-6 border-t border-[#263D59]/18 pt-3 font-mono text-[9px] tracking-[0.18em] text-[#5B5243] uppercase">
          MOVEMENT {stage.index} OF IV · LIBER PRIMUS
        </p>
      </div>

      {/* Running Footer */}
      <footer className="relative z-10 flex items-center justify-between border-t border-[#263D59]/18 pt-1.5 pr-2 font-mono text-[8.5px] tracking-[0.18em] text-[#6A6050] uppercase xl:text-[9px]">
        <span>LISMUN ARCHIVE · LIBER I</span>
        <span className="tabular-nums text-[#0D1829]">p. {pageNumber}</span>
      </footer>
    </div>
  );
};

/**
 * Right-hand editorial book page: Signature Pull-Quote, Numbered Annotations & Archival Index (Text-Only)
 */
export const SpreadRightPage: React.FC<{ stage: ExperienceStage }> = ({
  stage,
}) => {
  const pageNumber = String(Number(stage.index) * 2).padStart(2, '0');

  return (
    <div className="book-ivory-paper relative flex h-full w-full flex-col justify-between overflow-hidden rounded-r-[3px] border border-[#C9BEA8] p-5 sm:p-6 xl:p-8">
      {/* Inner margin frame & subtle left spine crease shadow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-2.5 border border-[#263D59]/18"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#141D2B]/20 via-[#141D2B]/06 to-transparent"
      />

      {/* Running Header */}
      <header className="relative z-10 flex items-center justify-between border-b border-[#263D59]/22 pb-2 pl-2 font-mono text-[8.5px] tracking-[0.18em] text-[#5B5243] uppercase xl:text-[9.5px]">
        <span>THE LIVING ATLAS</span>
        <span>CHAPTER {stage.roman}</span>
      </header>

      {/* Right-Page Balanced Text Spread: Pull-Quote + Annotations + Archival Colophon */}
      <div className="relative z-10 my-auto flex flex-col justify-between py-2 pl-2.5">
        {/* Signature Pull-Quote bounded by antique gold hairlines */}
        <blockquote className="border-y border-[#7A6136]/35 py-3.5 font-display text-xl leading-[1.28] font-medium italic text-[#14233A] sm:text-2xl xl:py-4 xl:text-[1.65rem]">
          “{stage.quote}”
        </blockquote>

        {/* Numbered Diplomatic Annotations */}
        <div className="mt-4 xl:mt-5">
          <p className="font-mono text-[8.5px] tracking-[0.22em] text-[#7A6136] uppercase xl:text-[9.5px]">
            Archival Dossier Notes
          </p>
          <ul className="mt-2.5 divide-y divide-[#263D59]/14 border-y border-[#263D59]/18">
            {stage.annotations.map((note, idx) => (
              <li
                key={note}
                className="flex items-baseline gap-3 py-2 font-sans text-xs text-[#243042] xl:py-2.5 xl:text-[13px]"
              >
                <span className="font-mono text-[9px] tabular-nums tracking-[0.14em] text-[#7A6136]">
                  0{idx + 1}.
                </span>
                <span className="leading-snug">{note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Archival Footnote / Final Act Colophon */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#7A6136]/28 pt-3 xl:mt-5">
          <div>
            <p className="font-mono text-[8.5px] tracking-[0.18em] text-[#7A6136] uppercase">
              {stage.archivalHeading}
            </p>
            <p className="mt-1 font-serif text-xs leading-snug italic text-[#2B3544] xl:text-[13px]">
              {stage.archivalNote}
            </p>
          </div>

          {stage.id === 'resolution' && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#7A6136]/50 bg-[#071426] p-1">
              <BritusEmblem size={26} variant="engraved" />
            </div>
          )}
        </div>
      </div>

      {/* Running Footer */}
      <footer className="relative z-10 flex items-center justify-between border-t border-[#263D59]/18 pt-1.5 pl-2 font-mono text-[8.5px] tracking-[0.18em] text-[#6A6050] uppercase xl:text-[9px]">
        <span>{stage.title}</span>
        <span className="tabular-nums text-[#0D1829]">p. {pageNumber}</span>
      </footer>
    </div>
  );
};

/**
 * Embossed Back Leather Board beneath final page
 */
export const BackCoverBoard: React.FC = () => (
  <div
    aria-hidden="true"
    className="book-leather-surface pointer-events-none absolute -top-2 -right-2 -bottom-2 left-0 rounded-r-[6px] border border-[#B89A62]/40 shadow-[0_18px_46px_rgba(0,0,0,0.75)]"
  />
);

/**
 * Mobile portrait full-width ivory chapter page (combines narrative, pull-quote, and archival notes cleanly without narrow split columns)
 */
export const MobileChroniclePage: React.FC<{ stage: ExperienceStage }> = ({
  stage,
}) => {
  return (
    <div className="book-ivory-paper relative flex h-full w-full flex-col justify-between overflow-hidden rounded-r-[4px] border border-[#C9BEA8] px-5 py-4 pl-6 shadow-[inset_10px_0_18px_rgba(20,29,43,0.16)]">
      {/* Inner double rule & left gutter crease shadow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-2.5 border border-[#263D59]/18"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-[#141D2B]/22 via-[#141D2B]/06 to-transparent"
      />

      {/* Running Header */}
      <header className="relative z-10 flex items-center justify-between gap-2 border-b border-[#263D59]/22 pb-1.5 font-mono text-[8.5px] tracking-[0.15em] text-[#5B5243] uppercase">
        <span className="truncate">{stage.folioCode}</span>
        <span className="shrink-0 text-[#7A6136]">{stage.coordinate}</span>
      </header>

      {/* Main Portrait Chapter Body */}
      <div className="relative z-10 my-auto flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-1.5">
        <p className="font-mono text-[9px] tracking-[0.2em] text-[#7A6136] uppercase">
          Chapter {stage.roman} — {stage.subtitle}
        </p>

        <h3 className="mt-1 font-display text-[1.75rem] leading-[1.04] font-semibold tracking-[0.01em] text-[#0D1829] sm:text-3xl">
          {stage.title}
        </h3>

        <p className="mt-2.5 font-serif text-[14px] leading-[1.55] text-[#222B38] first-letter:float-left first-letter:mr-2 first-letter:mt-0.5 first-letter:font-display first-letter:text-3xl first-letter:leading-none first-letter:font-semibold first-letter:text-[#7A6136] sm:text-[15px]">
          {stage.description}
        </p>

        <blockquote className="mt-3 border-y border-[#7A6136]/35 py-2 font-display text-[16.5px] leading-[1.25] font-medium italic text-[#14233A] sm:text-lg">
          “{stage.quote}”
        </blockquote>

        <ul className="mt-2.5 divide-y divide-[#263D59]/14 border-b border-[#263D59]/18">
          {stage.annotations.map((note, idx) => (
            <li
              key={note}
              className="flex items-baseline gap-2.5 py-1.5 font-sans text-[11.5px] text-[#243042]"
            >
              <span className="font-mono text-[8.5px] tabular-nums tracking-[0.12em] text-[#7A6136]">
                0{idx + 1}.
              </span>
              <span className="leading-snug">{note}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Running Footer */}
      <footer className="relative z-10 flex items-center justify-between border-t border-[#263D59]/18 pt-1.5 font-mono text-[8.5px] tracking-[0.16em] text-[#6A6050] uppercase">
        <span>MOVEMENT {stage.index} OF IV</span>
        <span className="tabular-nums text-[#0D1829]">FOLIO {stage.roman}</span>
      </footer>
    </div>
  );
};

/**
 * Mobile Closing Leather Colophon shown after Chapter IV flips
 */
export const MobileClosingFace: React.FC = () => (
  <div className="book-leather-surface relative flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-r-[6px] border border-[#B89A62]/45 p-6 pl-7 text-center shadow-[inset_10px_0_20px_rgba(0,0,0,0.6)]">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-4 border border-[#B89A62]/35"
    />
    <p className="relative z-10 font-mono text-[9px] tracking-[0.26em] text-[#B89A62]/85 uppercase">
      LIBER PRIMUS · COMPLETE
    </p>
    <div className="relative z-10 flex flex-col items-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#B89A62]/45 bg-[#040D1B] p-1.5">
        <BritusEmblem size={68} variant="engraved" />
      </div>
      <h3 className="mt-4 font-display text-2xl font-medium tracking-[0.04em] text-[#D5BD8B]">
        To the Council Chambers
      </h3>
      <p className="mt-2 max-w-[230px] font-serif text-sm italic text-[#E8E1D2]/75">
        Follow the meridian route downward to explore Session I committees.
      </p>
    </div>
    <p className="relative z-10 font-mono text-[9px] tracking-[0.22em] text-[#B89A62]/75 uppercase">
      SCROLL TO CONTINUE · SECTION III
    </p>
  </div>
);
