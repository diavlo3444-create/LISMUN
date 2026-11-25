import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { EXPERIENCE_STAGES } from '../data/conferenceData';
import {
  BOOK_SNAP_POINTS,
  computeDiscreteBookState,
  getChapterStep,
  getProgressForBookStep,
  getStepFromScrollProgress,
  type BookStep,
} from '../utils/bookPhysics';
import {
  ensureGsapRegistered,
  gsap,
  observeAmbientVisibility,
  prefersReducedMotion,
  prepareSvgPathDraw,
  ScrollTrigger,
} from '../utils/atlasAnimations';
import {
  BackCoverBoard,
  FrontCoverFace,
  MobileChroniclePage,
  MobileClosingFace,
  SpreadLeftPage,
  SpreadRightPage,
} from './BookSpreadPages';

export const ExperienceSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const pinStageRef = useRef<HTMLDivElement>(null);
  const mobilePinStageRef = useRef<HTMLDivElement>(null);
  const exitRoutePathRef = useRef<SVGPathElement>(null);
  const exitRouteLengthRef = useRef<number>(0);
  const scrollTriggerRef = useRef<ScrollTrigger | null>(null);
  const activeStepRef = useRef<BookStep>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [activeStep, setActiveStep] = useState<BookStep>(() =>
    typeof window !== 'undefined' && prefersReducedMotion() ? 1 : 0
  );

  const updateStepIfChanged = useCallback((nextStep: BookStep) => {
    if (activeStepRef.current !== nextStep) {
      activeStepRef.current = nextStep;
      setActiveStep(nextStep);
    }
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const pinStage = pinStageRef.current;
    const mobilePinStage = mobilePinStageRef.current;
    if (!section || !pinStage || !mobilePinStage) return;

    ensureGsapRegistered();

    if (exitRoutePathRef.current) {
      exitRouteLengthRef.current = prepareSvgPathDraw(exitRoutePathRef.current);
    }

    if (prefersReducedMotion()) {
      updateStepIfChanged(1);
      return;
    }

    const stopAmbient = observeAmbientVisibility(section);

    const mm = gsap.matchMedia();

    mm.add('(min-width: 1024px)', () => {
      gsap.fromTo(
        '[data-exp-chrome]',
        { y: 12, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.65,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: pinStage,
            start: 'top 80%',
            once: true,
          },
        }
      );

      const st = ScrollTrigger.create({
        trigger: pinStage,
        start: 'top top',
        end: '+=1100',
        pin: true,
        anticipatePin: 1,
        snap: {
          snapTo: [...BOOK_SNAP_POINTS],
          duration: { min: 0.08, max: 0.18 },
          delay: 0.01,
          ease: 'power2.out',
        },
        onUpdate: (self) => {
          updateStepIfChanged(getStepFromScrollProgress(self.progress));
        },
      });
      scrollTriggerRef.current = st;

      return () => {
        scrollTriggerRef.current = null;
        st.kill();
      };
    });

    mm.add('(max-width: 1023px)', () => {
      const st = ScrollTrigger.create({
        trigger: mobilePinStage,
        start: 'top top',
        end: '+=960',
        pin: true,
        anticipatePin: 1,
        snap: {
          snapTo: [...BOOK_SNAP_POINTS],
          duration: { min: 0.08, max: 0.18 },
          delay: 0.02,
          ease: 'power2.out',
        },
        onUpdate: (self) => {
          updateStepIfChanged(getStepFromScrollProgress(self.progress));
        },
      });
      scrollTriggerRef.current = st;

      return () => {
        scrollTriggerRef.current = null;
        st.kill();
      };
    });

    return () => {
      stopAmbient();
      scrollTriggerRef.current = null;
      mm.revert();
    };
  }, [updateStepIfChanged]);

  const bookState = computeDiscreteBookState(activeStep);

  useEffect(() => {
    const pathEl = exitRoutePathRef.current;
    if (!pathEl || exitRouteLengthRef.current <= 0) return;
    pathEl.style.transition = 'stroke-dashoffset 450ms ease-out';
    pathEl.style.strokeDashoffset = bookState.exitRouteComplete
      ? '0'
      : `${exitRouteLengthRef.current}`;
  }, [bookState.exitRouteComplete]);

  const jumpToStep = (targetStep: BookStep) => {
    const st = scrollTriggerRef.current;
    if (!st) {
      updateStepIfChanged(targetStep);
      return;
    }

    const targetProgress = getProgressForBookStep(targetStep);
    const targetScrollY = st.start + targetProgress * (st.end - st.start);
    updateStepIfChanged(targetStep);
    window.scrollTo({
      top: targetScrollY,
      behavior: 'auto',
    });
  };

  const jumpToChapter = (chapterIndex: number) => {
    jumpToStep(getChapterStep(chapterIndex));
  };

  const handleBookSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isRightHalf = e.clientX >= rect.left + rect.width / 2;

    if (activeStep === 0) {
      jumpToStep(1);
      return;
    }
    if (activeStep === 5) {
      jumpToStep(4);
      return;
    }
    if (isRightHalf) {
      jumpToStep(Math.min(5, activeStep + 1) as BookStep);
    } else {
      jumpToStep(Math.max(0, activeStep - 1) as BookStep);
    }
  };

  const handleMobileTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleMobileTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) {
        jumpToStep(Math.min(5, activeStep + 1) as BookStep);
      } else {
        jumpToStep(Math.max(0, activeStep - 1) as BookStep);
      }
    }
  };

  const [research, debate, diplomacy, resolution] = EXPERIENCE_STAGES;

  // Mobile 5-leaf stack: 0 = Front Cover, 1..4 = Chapters I..IV (flipping to reveal Base Closing Face at step 5)
  const mobileLeaves = [
    { id: 'cover', isFlipped: activeStep >= 1, zIndex: 60 },
    { id: research.id, isFlipped: activeStep >= 2, zIndex: 50, stage: research },
    { id: debate.id, isFlipped: activeStep >= 3, zIndex: 40, stage: debate },
    { id: diplomacy.id, isFlipped: activeStep >= 4, zIndex: 30, stage: diplomacy },
    { id: resolution.id, isFlipped: activeStep >= 5, zIndex: 20, stage: resolution },
  ];

  const getMobileLeafStyle = (
    isFlipped: boolean,
    baseZ: number
  ): React.CSSProperties => ({
    transformOrigin: 'left center',
    transform: isFlipped ? 'rotateY(-155deg)' : 'rotateY(0deg)',
    opacity: isFlipped ? 0 : 1,
    pointerEvents: isFlipped ? 'none' : 'auto',
    zIndex: isFlipped ? 70 - baseZ : baseZ,
    transition: isFlipped
      ? 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 210ms ease-out 210ms'
      : 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 170ms ease-out',
    willChange: 'transform, opacity',
  });

  return (
    <section
      id="experience"
      ref={sectionRef}
      className="relative overflow-x-clip border-t border-[#263D59]/50 bg-transparent"
    >
      {/* DESKTOP DISCRETE-SNAP 3D BOOK STAGE (>= lg) */}
      <div
        ref={pinStageRef}
        className="relative hidden h-screen w-full flex-col justify-between overflow-hidden pt-[68px] pb-4 lg:flex"
      >
        {/* Subtle Desk Mood Spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(22,42,74,0.2)_0%,rgba(3,9,20,0.36)_72%)]"
        />

        {/* Top Quiet Archival Running Index */}
        <div
          data-exp-chrome
          className="relative z-20 mx-auto flex w-full max-w-[1440px] items-center justify-between px-10 pt-2"
        >
          <div>
            <p className="font-mono text-[11px] tracking-[0.26em] text-[#B89A62] uppercase">
              02 · The Delegate Experience
            </p>
            <h2 className="mt-0.5 font-display text-2xl font-medium text-[#E8E1D2] xl:text-3xl">
              The Diplomatic Chronicle
            </h2>
          </div>

          <div className="text-right font-mono text-[11px] tracking-[0.22em] text-[#D5BD8B] uppercase">
            <span>{bookState.phaseLabel}</span>
            <span className="ml-4 tabular-nums text-[#E8E1D2]/50">
              {bookState.activeChapterIndex + 1} / 4
            </span>
          </div>
        </div>

        {/* Center 3D Book Stage */}
        <div
          className="relative z-20 my-1 flex flex-1 items-center justify-center px-8"
          style={{ perspective: '2000px' }}
        >
          {/* Ambient Desk Shadow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute h-[58vh] w-[min(84vw,920px)] bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.3)_46%,transparent_72%)]"
          />

          {/* Discrete GPU-Composited 3D Volume */}
          <div
            onClick={handleBookSurfaceClick}
            data-testid="diplomatic-book-3d"
            data-book-step={activeStep}
            style={{
              transform: `translate3d(${bookState.bookTranslateXPercent}%, 0, 0) scale(${bookState.bookScale})`,
              opacity: bookState.bookOpacity,
            }}
            className="book-preserve-3d book-volume-glide relative h-[min(60vh,560px)] w-[min(86vw,960px)] cursor-pointer"
          >
            {/* Stationary Center Leather Spine */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-2 -bottom-2 left-1/2 z-[5] w-4 -translate-x-1/2 rounded-sm bg-gradient-to-r from-[#040B16] via-[#152B49] to-[#040B16]"
            />

            {/* Stacked Paper Edge Cue — Right Half */}
            <div
              aria-hidden="true"
              style={{
                opacity: bookState.rightStackWeight > 0 ? 1 : 0,
                transform: `scaleX(${Math.max(0.25, bookState.rightStackWeight)})`,
              }}
              className="pointer-events-none absolute top-[4px] right-[-6px] bottom-[4px] z-[3] w-2 origin-left rounded-r-[2px] border-y border-r border-[#A69B85] bg-[#DFD6C4] transition-transform duration-300"
            />

            {/* Stacked Paper Edge Cue — Left Half */}
            <div
              aria-hidden="true"
              style={{
                opacity: bookState.leftStackWeight > 0 ? 1 : 0,
                transform: `scaleX(${Math.max(0.25, bookState.leftStackWeight)})`,
              }}
              className="pointer-events-none absolute top-[4px] bottom-[4px] left-[-6px] z-[3] w-2 origin-right rounded-l-[2px] border-y border-l border-[#A69B85] bg-[#DFD6C4] transition-transform duration-300"
            />

            {/* STATIONARY BASE RIGHT BOARD + CHAPTER IV RIGHT PAGE */}
            <div
              style={{ zIndex: 1 }}
              className="book-preserve-3d absolute top-0 left-1/2 h-full w-1/2"
            >
              <BackCoverBoard />
              <div className="relative h-full w-full">
                <SpreadRightPage stage={resolution} />
              </div>
            </div>

            {/* LEAF 3: Front = Ch. III Right (Diplomacy), Back = Ch. IV Left (Resolution) */}
            <div
              style={{
                transformOrigin: 'left center',
                transform: `rotateY(${bookState.leafAngles[3]}deg)`,
                zIndex: bookState.leafZIndices[3],
              }}
              className="book-preserve-3d book-leaf-turn absolute top-0 left-1/2 h-full w-1/2"
            >
              <div className="book-backface-hidden absolute inset-0">
                <SpreadRightPage stage={diplomacy} />
              </div>
              <div
                style={{ transform: 'rotateY(180deg)' }}
                className="book-backface-hidden absolute inset-0"
              >
                <SpreadLeftPage stage={resolution} />
              </div>
            </div>

            {/* LEAF 2: Front = Ch. II Right (Debate), Back = Ch. III Left (Diplomacy) */}
            <div
              style={{
                transformOrigin: 'left center',
                transform: `rotateY(${bookState.leafAngles[2]}deg)`,
                zIndex: bookState.leafZIndices[2],
              }}
              className="book-preserve-3d book-leaf-turn absolute top-0 left-1/2 h-full w-1/2"
            >
              <div className="book-backface-hidden absolute inset-0">
                <SpreadRightPage stage={debate} />
              </div>
              <div
                style={{ transform: 'rotateY(180deg)' }}
                className="book-backface-hidden absolute inset-0"
              >
                <SpreadLeftPage stage={diplomacy} />
              </div>
            </div>

            {/* LEAF 1: Front = Ch. I Right (Research), Back = Ch. II Left (Debate) */}
            <div
              style={{
                transformOrigin: 'left center',
                transform: `rotateY(${bookState.leafAngles[1]}deg)`,
                zIndex: bookState.leafZIndices[1],
              }}
              className="book-preserve-3d book-leaf-turn absolute top-0 left-1/2 h-full w-1/2"
            >
              <div className="book-backface-hidden absolute inset-0">
                <SpreadRightPage stage={research} />
              </div>
              <div
                style={{ transform: 'rotateY(180deg)' }}
                className="book-backface-hidden absolute inset-0"
              >
                <SpreadLeftPage stage={debate} />
              </div>
            </div>

            {/* LEAF 0 (Front Hardcover Board): Front = Leather Cover, Back = Leather Rim + Ch. I Left */}
            <div
              style={{
                transformOrigin: 'left center',
                transform: `rotateY(${bookState.leafAngles[0]}deg)`,
                zIndex: bookState.leafZIndices[0],
              }}
              className="book-preserve-3d book-leaf-turn absolute top-0 left-1/2 h-full w-1/2"
            >
              <div className="book-backface-hidden absolute -top-2 -right-2 -bottom-2 left-0">
                <FrontCoverFace />
              </div>
              <div
                style={{ transform: 'rotateY(180deg)' }}
                className="book-backface-hidden absolute inset-0"
              >
                <div
                  aria-hidden="true"
                  className="book-leather-surface pointer-events-none absolute -top-2 -bottom-2 -left-2 right-0 rounded-l-[6px] border border-[#B89A62]/40 shadow-[0_18px_46px_rgba(0,0,0,0.75)]"
                />
                <div className="relative h-full w-full">
                  <SpreadLeftPage stage={research} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Exit Transition Golden Route Streaming from Book Spine toward Committees */}
        <svg
          viewBox="0 0 180 180"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 z-10 h-32 w-24 -translate-x-1/2"
        >
          <path
            ref={exitRoutePathRef}
            d="M 90 0 C 90 48, 56 78, 90 124 C 118 156, 90 168, 90 180"
            fill="none"
            stroke="#D5BD8B"
            strokeWidth="1.5"
            strokeOpacity="0.9"
          />
          {bookState.exitRouteComplete && (
            <path
              d="M 90 0 C 90 48, 56 78, 90 124 C 118 156, 90 168, 90 180"
              fill="none"
              stroke="#E8E1D2"
              strokeWidth="2"
              strokeDasharray="6 24"
              className="atlas-ambient-route"
            />
          )}
        </svg>

        {/* Bottom Chapter Index Bar (Direct Jump & Discrete Scroll Indicator) */}
        <div
          data-exp-chrome
          className="relative z-20 mx-auto flex w-full max-w-[1440px] items-center justify-between px-10"
        >
          <div
            role="tablist"
            aria-label="Diplomatic Chronicle Chapters"
            className="flex items-center gap-2"
          >
            {EXPERIENCE_STAGES.map((stage, idx) => {
              const isActive =
                bookState.isBookOpen && bookState.activeChapterIndex === idx;
              return (
                <button
                  key={stage.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => jumpToChapter(idx)}
                  className={`min-h-[40px] border px-3.5 py-2 font-mono text-[11px] tracking-[0.16em] uppercase whitespace-nowrap shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B] ${
                    isActive
                      ? 'border-[#D5BD8B] bg-[#0B1E38] text-[#E8E1D2]'
                      : 'border-[#263D59]/60 bg-[#030914]/80 text-[#E8E1D2]/60 hover:border-[#B89A62]/60 hover:text-[#E8E1D2]'
                  }`}
                >
                  {stage.roman}. {stage.title}
                </button>
              );
            })}
          </div>

          <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62]/80 uppercase">
            Scroll or Click Pages to Turn · Select Chapter to Jump
          </p>
        </div>
      </div>

      {/* MOBILE SCROLL-DRIVEN 3D FLIPPING FOLIO STAGE (< lg) */}
      <div
        ref={mobilePinStageRef}
        className="relative flex h-[100dvh] w-full flex-col justify-between overflow-hidden px-4 pt-[68px] pb-4 lg:hidden"
      >
        {/* Subtle Desk Mood Spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(22,42,74,0.22)_0%,rgba(3,9,20,0.42)_74%)]"
        />

        {/* Mobile Running Header */}
        <div className="relative z-20 mx-auto flex w-full max-w-md items-end justify-between gap-2 pt-1">
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] text-[#B89A62] uppercase">
              02 · The Delegate Experience
            </p>
            <h2 className="mt-0.5 font-display text-2xl leading-tight font-medium text-[#E8E1D2]">
              The Diplomatic Chronicle
            </h2>
          </div>

          <p className="shrink-0 font-mono text-[10px] tabular-nums tracking-[0.18em] text-[#D5BD8B] uppercase">
            {activeStep === 0
              ? 'COVER'
              : activeStep === 5
                ? 'FOLIO END'
                : `${activeStep} / 4`}
          </p>
        </div>

        {/* Center Pinned 3D Portrait Flipping Book */}
        <div
          className="relative z-20 my-auto flex flex-1 items-center justify-center py-2"
          style={{ perspective: '1300px' }}
        >
          <div
            onClick={handleBookSurfaceClick}
            onTouchStart={handleMobileTouchStart}
            onTouchEnd={handleMobileTouchEnd}
            data-testid="diplomatic-book-3d-mobile"
            data-book-step={activeStep}
            className="book-preserve-3d relative h-[min(56dvh,470px)] w-[min(86vw,380px)] cursor-pointer select-none"
          >
            {/* Stationary Left Leather Spine Hinge */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-2 -bottom-2 left-0 z-[75] w-3.5 rounded-l-[4px] bg-gradient-to-r from-[#030812] via-[#172F50] to-[#081529] shadow-[2px_0_8px_rgba(0,0,0,0.55)]"
            />

            {/* Right Edge Stacked Paper Thickness Indicator */}
            <div
              aria-hidden="true"
              style={{
                opacity: activeStep < 5 ? 1 : 0.25,
                transform: `scaleX(${Math.max(0.25, (5 - activeStep) / 5)})`,
              }}
              className="pointer-events-none absolute top-[4px] right-[-6px] bottom-[4px] z-[5] w-2 origin-left rounded-r-[2px] border-y border-r border-[#A69B85] bg-[#DFD6C4] transition-transform duration-300"
            />

            {/* Stationary Base: Back Cover Board + Closing Folio */}
            <div
              style={{ zIndex: 1 }}
              className="book-preserve-3d absolute inset-0"
            >
              <BackCoverBoard />
              <div className="relative h-full w-full">
                <MobileClosingFace />
              </div>
            </div>

            {/* Hinged 3D Turning Leaves (Front Cover + Chapters I–IV) */}
            {mobileLeaves.map((leaf) => (
              <div
                key={leaf.id}
                data-mobile-leaf={leaf.id}
                data-flipped={leaf.isFlipped ? 'true' : 'false'}
                style={getMobileLeafStyle(leaf.isFlipped, leaf.zIndex)}
                className="book-preserve-3d absolute inset-0"
              >
                {/* Front Face */}
                <div
                  className={`book-backface-hidden absolute ${
                    leaf.id === 'cover' ? '-top-2 -right-2 -bottom-2 left-0' : 'inset-0'
                  }`}
                >
                  {leaf.id === 'cover' ? (
                    <FrontCoverFace />
                  ) : (
                    leaf.stage && <MobileChroniclePage stage={leaf.stage} />
                  )}
                </div>

                {/* Reverse Face Visible Mid-Flip */}
                <div
                  style={{ transform: 'rotateY(180deg)' }}
                  className="book-backface-hidden absolute inset-0"
                >
                  <div
                    className={`h-full w-full rounded-l-[4px] border ${
                      leaf.id === 'cover'
                        ? 'book-leather-surface border-[#B89A62]/40'
                        : 'book-ivory-paper border-[#C9BEA8]'
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Chapter Switcher & Prev/Next Turn Controls */}
        <div className="relative z-20 mx-auto w-full max-w-md space-y-2.5">
          <div
            role="tablist"
            aria-label="Mobile Book Chapters"
            className="grid grid-cols-4 gap-1.5"
          >
            {EXPERIENCE_STAGES.map((stage, idx) => {
              const isActive =
                bookState.isBookOpen && bookState.activeChapterIndex === idx;
              return (
                <button
                  key={stage.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => jumpToChapter(idx)}
                  className={`min-h-[40px] border px-2 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-[#D5BD8B] bg-[#0B1E38] text-[#E8E1D2]'
                      : 'border-[#263D59]/70 bg-[#030914]/80 text-[#E8E1D2]/65'
                  }`}
                >
                  {stage.roman}. {stage.title}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#263D59]/55 pt-2.5">
            <button
              type="button"
              disabled={activeStep === 0}
              onClick={() => jumpToStep(Math.max(0, activeStep - 1) as BookStep)}
              className="inline-flex min-h-[44px] items-center gap-1.5 border border-[#263D59] bg-[#030914]/80 px-3.5 py-2 font-mono text-[10.5px] tracking-[0.14em] text-[#E8E1D2] uppercase whitespace-nowrap shrink-0 disabled:opacity-35"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>

            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase whitespace-nowrap">
              <BookOpen className="h-3 w-3" />
              <span>Scroll or Swipe</span>
            </span>

            <button
              type="button"
              disabled={activeStep === 5}
              onClick={() => jumpToStep(Math.min(5, activeStep + 1) as BookStep)}
              className="inline-flex min-h-[44px] items-center gap-1.5 border border-[#B89A62]/60 bg-[#071426]/90 px-3.5 py-2 font-mono text-[10.5px] tracking-[0.14em] text-[#E8E1D2] uppercase whitespace-nowrap shrink-0 disabled:opacity-35"
            >
              <span>{activeStep === 0 ? 'Open Book' : 'Turn Page'}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#D5BD8B]" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
