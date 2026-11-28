import React, {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Crown,
  Maximize2,
} from 'lucide-react';
import {
  BOARD_COLS,
  BOARD_ROWS,
  CHESS_PIECE_LEGEND,
  EXECUTIVE_BOARD_MEMBERS,
  EXECUTIVE_DEPARTMENTS,
  FILE_LETTERS,
  PDF_AMBIGUITIES_FOR_REVIEW,
  getMemberBySquare,
  getMembersByDepartment,
  isLightSquare,
  type ChessPieceType,
  type ExecutiveBoardMember,
} from '../data/executiveBoardData';
import {
  createAtlasScrollContext,
  gsap,
  observeAmbientVisibility,
} from '../utils/atlasAnimations';
import { ChessPieceGlyph } from './chess/ChessPieceGlyph';
import {
  LaurelWreathAccent,
  OrnamentalGoldDivider,
} from './LuxuryOrnaments';

const LazyChessboardCanvas = lazy(
  () => import('./chess/ExecutiveChessboardCanvas')
);

const PIECE_RANK_LABELS: Record<ChessPieceType, string> = {
  king: 'King',
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
  pawn: 'Pawn',
};

export const SecretariatSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [selectedMember, setSelectedMember] =
    useState<ExecutiveBoardMember | null>(null);
  const [highlightedRank, setHighlightedRank] =
    useState<ChessPieceType | null>(null);
  const [activeDepartment, setActiveDepartment] = useState<string>('ALL');
  const [webglFallback, setWebglFallback] = useState<boolean>(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const stopAmbient = observeAmbientVisibility(section);
    const stopCtx = createAtlasScrollContext(section, () => {
      gsap.fromTo(
        '[data-secretariat-header]',
        { y: 12 },
        {
          y: 0,
          duration: 0.45,
          stagger: 0.05,
          ease: 'power3.out',
          clearProps: 'transform',
          scrollTrigger: {
            trigger: section,
            start: 'top 95%',
            once: true,
          },
        }
      );

      gsap.fromTo(
        '[data-secretariat-stage]',
        { y: 14 },
        {
          y: 0,
          duration: 0.55,
          ease: 'power3.out',
          clearProps: 'transform',
          scrollTrigger: {
            trigger: section,
            start: 'top 92%',
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

  // Keyboard Escape clears active piece selection back to full board
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedMember) {
        setSelectedMember(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedMember]);

  const filteredDirectoryMembers = useMemo(() => {
    const base =
      activeDepartment === 'ALL'
        ? EXECUTIVE_BOARD_MEMBERS
        : getMembersByDepartment(activeDepartment, EXECUTIVE_BOARD_MEMBERS);
    if (!highlightedRank) return [...base];
    return base.filter((m) => m.pieceType === highlightedRank);
  }, [activeDepartment, highlightedRank]);

  const goldCount = useMemo(
    () => EXECUTIVE_BOARD_MEMBERS.filter((m) => m.side === 'gold').length,
    []
  );
  const navyCount = useMemo(
    () => EXECUTIVE_BOARD_MEMBERS.filter((m) => m.side === 'navy').length,
    []
  );

  const selectedIndex = selectedMember
    ? EXECUTIVE_BOARD_MEMBERS.findIndex((m) => m.id === selectedMember.id)
    : -1;

  const stepMember = (delta: number) => {
    if (EXECUTIVE_BOARD_MEMBERS.length === 0) return;
    if (selectedIndex === -1) {
      setSelectedMember(EXECUTIVE_BOARD_MEMBERS[0]);
      return;
    }
    const nextIdx =
      (selectedIndex + delta + EXECUTIVE_BOARD_MEMBERS.length) %
      EXECUTIVE_BOARD_MEMBERS.length;
    setSelectedMember(EXECUTIVE_BOARD_MEMBERS[nextIdx]);
  };

  const handleSelectMemberFromDirectory = (member: ExecutiveBoardMember) => {
    setSelectedMember(member);
    stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const primarySgMember =
    EXECUTIVE_BOARD_MEMBERS.find((m) => m.id === 'sec-sg-mallak') ??
    EXECUTIVE_BOARD_MEMBERS[0];

  return (
    <section
      id="secretariat"
      ref={sectionRef}
      className="relative border-t border-[#B89A62]/25 bg-transparent pt-12 pb-24 md:pt-16 md:pb-32"
    >
      <OrnamentalGoldDivider
        label={`Executive Board · ${EXECUTIVE_BOARD_MEMBERS.length} Appointments`}
        className="mb-12 md:mb-16"
      />

      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        {/* Institutional Introduction */}
        <div
          data-secretariat-header
          className="flex flex-col justify-between gap-6 border-b border-[#B89A62]/25 pb-8 lg:flex-row lg:items-end"
        >
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <p className="font-mono text-xs tracking-[0.26em] text-[#83B5ED] uppercase">
                04 · Executive Board Chessboard
              </p>
              <LaurelWreathAccent size={40} />
            </div>
            <h2
              className="mt-3 font-display text-4xl leading-tight font-medium tracking-wide text-[#E8E1D2] uppercase md:text-5xl lg:text-[3.4rem]"
              style={{ textWrap: 'balance' }}
            >
              THE INSTITUTIONAL SECRETARIAT
            </h2>
            <p className="mt-2 font-display text-xl italic text-[#D5BD8B] md:text-2xl">
              The leadership, vision, and structure behind LIS MUN.
            </p>
          </div>

          <p className="max-w-md font-sans text-sm leading-relaxed text-[#E8E1D2]/75">
            One unified 8×8 diplomatic chessboard houses all{' '}
            {EXECUTIVE_BOARD_MEMBERS.length} Executive Board members from the
            LISMUN organizational chart—Secretaries presiding at the Rank 8
            apex above 12 grouped department blocks. Orbit, filter by rank or
            department, or select any piece to inspect its officeholder.
          </p>
        </div>

        {/* Piece Hierarchy Legend */}
        <div
          data-secretariat-header
          aria-label="Chess piece organizational hierarchy legend"
          className="mt-8 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6"
        >
          {CHESS_PIECE_LEGEND.map((item) => {
            const isActive = highlightedRank === item.pieceType;
            return (
              <button
                key={item.pieceType}
                type="button"
                aria-pressed={isActive}
                onClick={() =>
                  setHighlightedRank((prev) =>
                    prev === item.pieceType ? null : item.pieceType
                  )
                }
                className={`flex flex-col justify-between border p-3.5 text-left transition-colors ${
                  isActive
                    ? 'border-[#D5BD8B] bg-[#0F2442]'
                    : 'border-[#B89A62]/25 bg-[#050F1F]/90 hover:border-[#83B5ED]/55 hover:bg-[#08162C]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ChessPieceGlyph
                      pieceType={item.pieceType}
                      side="gold"
                      size={22}
                    />
                    <span className="font-display text-lg font-medium text-[#E8E1D2]">
                      {item.pieceLabel}
                    </span>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-[#83B5ED]">
                    {item.count}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-[#D5BD8B] uppercase">
                  {item.hierarchyTitle}
                </p>
                <p className="mt-1 font-sans text-[11px] leading-snug text-[#E8E1D2]/65">
                  {item.scopeDescription}
                </p>
              </button>
            );
          })}
        </div>

        {/* Main 3D Chessboard Stage + Integrated Architectural Dossier Panel */}
        <div
          ref={stageRef}
          data-secretariat-stage
          className="atlas-luxury-card mt-8 grid grid-cols-1 overflow-hidden lg:grid-cols-12"
        >
          {/* Left / Center: Single 8x8 Chessboard Status Strip + 3D Viewport */}
          <div className="min-w-0 p-3 sm:p-4 lg:col-span-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-[#B89A62]/25 bg-[#040C1A] px-3 py-2">
              <span className="font-mono text-[10px] tracking-[0.14em] text-[#D5BD8B] uppercase">
                Single 8×8 Chessboard · 64 Alternating Squares · H1 Light
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {activeDepartment !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setActiveDepartment('ALL')}
                    className="border border-[#83B5ED]/45 bg-[#0A1C35] px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] text-[#83B5ED] uppercase hover:border-[#83B5ED]"
                  >
                    Zone: {activeDepartment} ×
                  </button>
                )}
                <span className="font-mono text-[10px] tracking-[0.14em] text-[#83B5ED]/85 uppercase">
                  Rank 8 Apex · 12 Directorates
                </span>
              </div>
            </div>

            {webglFallback ? (
              <div
                data-testid="executive-chessboard-fallback"
                className="border border-[#B89A62]/30 bg-[#030914] p-3 sm:p-5"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] tracking-[0.16em] text-[#83B5ED] uppercase">
                    Single 8 × 8 Executive Board Chessboard · {EXECUTIVE_BOARD_MEMBERS.length} Pieces
                  </span>
                  <button
                    type="button"
                    onClick={() => setWebglFallback(false)}
                    className="border border-[#B89A62]/35 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-[#D5BD8B] uppercase hover:border-[#D5BD8B]"
                  >
                    Retry 3D View
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[500px]">
                    <div className="grid grid-cols-8 gap-1">
                      {Array.from({ length: BOARD_ROWS }).map((_, r) =>
                        Array.from({ length: BOARD_COLS }).map((__, c) => {
                          const m = getMemberBySquare(r, c);
                          const lightSq = isLightSquare(r, c);
                          const isSelected = selectedMember?.id === m?.id;
                          const isDeptMatch =
                            activeDepartment !== 'ALL' &&
                            m &&
                            (m.departments.includes(activeDepartment) ||
                              m.department === activeDepartment);
                          return (
                            <div
                              key={`${r}-${c}`}
                              className={`relative flex aspect-square items-center justify-center border ${
                                isSelected
                                  ? 'border-[#F0DFB8] bg-[#16345C]'
                                  : isDeptMatch
                                    ? 'border-[#83B5ED] bg-[#102949]'
                                    : lightSq
                                      ? 'border-[#B89A62]/45 bg-[#B89A62]/24'
                                      : 'border-[#263D59]/60 bg-[#061122]'
                              }`}
                            >
                              {m ? (
                                <button
                                  type="button"
                                  title={`${m.fullName} — ${m.officialPosition} (${m.department})`}
                                  onClick={() => setSelectedMember(m)}
                                  className="flex h-full w-full flex-col items-center justify-center p-0.5 text-center hover:bg-[#D5BD8B]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
                                >
                                  <ChessPieceGlyph
                                    pieceType={m.pieceType}
                                    side={m.side}
                                    size={22}
                                  />
                                  <span className="mt-0.5 w-full truncate font-sans text-[8px] leading-none text-[#E8E1D2]/85">
                                    {m.fullName}
                                  </span>
                                </button>
                              ) : (
                                <span className="font-mono text-[8px] text-[#E8E1D2]/22">
                                  {FILE_LETTERS[c]}
                                  {BOARD_ROWS - r}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="flex h-[460px] w-full flex-col items-center justify-center border border-[#B89A62]/30 bg-[#030914] p-6 text-center sm:h-[540px] lg:h-[600px]">
                    <Crown className="h-7 w-7 text-[#D5BD8B]" />
                    <p className="mt-3 font-display text-2xl text-[#E8E1D2]">
                      Initializing Diplomatic Chessboard
                    </p>
                    <p className="mt-1 font-mono text-[11px] tracking-[0.14em] text-[#83B5ED] uppercase">
                      Preparing Single 8×8 Court · {EXECUTIVE_BOARD_MEMBERS.length} Pieces
                    </p>
                  </div>
                }
              >
                <LazyChessboardCanvas
                  selectedMemberId={selectedMember?.id ?? null}
                  highlightedPieceType={highlightedRank}
                  activeDepartment={activeDepartment}
                  onSelectMember={setSelectedMember}
                  onFallbackRequested={() => setWebglFallback(true)}
                />
              </Suspense>
            )}
          </div>

          {/* Right: Integrated Member Information & Diplomatic Court Panel */}
          <aside
            aria-label="Executive Board member inspection panel"
            className="flex min-w-0 flex-col justify-between border-t border-[#B89A62]/25 bg-[#050E1E] p-5 sm:p-7 lg:col-span-4 lg:border-t-0 lg:border-l"
          >
            {selectedMember ? (
              <div
                key={selectedMember.id}
                className="atlas-reveal-in flex h-full flex-col justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B89A62]/25 pb-4">
                    <span className="font-mono text-[11px] tracking-[0.14em] text-[#83B5ED] uppercase">
                      Square {selectedMember.squareNotation} ·{' '}
                      {selectedMember.side === 'gold'
                        ? 'Gold Finish'
                        : 'Navy Lacquer'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedMember(null)}
                      className="inline-flex items-center gap-1.5 border border-[#B89A62]/40 bg-[#071426] px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-[#D5BD8B] uppercase transition-colors hover:border-[#D5BD8B] hover:text-[#F0DFB8] whitespace-nowrap shrink-0"
                    >
                      <Maximize2 className="h-3 w-3" />
                      <span>Return to Full Board</span>
                    </button>
                  </div>

                  {/* Piece Silhouette + Identity */}
                  <div className="mt-6 flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-[#B89A62]/45 bg-[#0A1931]">
                      <ChessPieceGlyph
                        pieceType={selectedMember.pieceType}
                        side={selectedMember.side}
                        size={42}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] tracking-[0.16em] text-[#D5BD8B] uppercase">
                        {PIECE_RANK_LABELS[selectedMember.pieceType]} Piece
                      </p>
                      <h3 className="mt-1 break-words font-display text-3xl leading-tight font-semibold text-[#E8E1D2]">
                        {selectedMember.fullName}
                      </h3>
                    </div>
                  </div>

                  {/* Exact Official Fields Required */}
                  <dl className="mt-7 divide-y divide-[#263D59]/55 border-y border-[#263D59]/55 text-sm">
                    <div className="py-3.5">
                      <dt className="font-mono text-[10px] tracking-[0.18em] text-[#83B5ED] uppercase">
                        Official Position
                      </dt>
                      <dd className="mt-1 font-sans text-base font-medium text-[#E8E1D2]">
                        {selectedMember.officialPosition}
                      </dd>
                    </div>
                    <div className="py-3.5">
                      <dt className="font-mono text-[10px] tracking-[0.18em] text-[#83B5ED] uppercase">
                        Department
                      </dt>
                      <dd className="mt-1 font-sans text-base font-medium text-[#D5BD8B]">
                        {selectedMember.department}
                      </dd>
                    </div>
                    <div className="py-3.5">
                      <dt className="font-mono text-[10px] tracking-[0.18em] text-[#83B5ED] uppercase">
                        Hierarchical Level
                      </dt>
                      <dd className="mt-1 font-sans text-sm leading-relaxed text-[#E8E1D2]/85">
                        {selectedMember.hierarchicalLevel}
                      </dd>
                    </div>
                  </dl>

                  {selectedMember.ambiguityNote && (
                    <div className="mt-4 border border-[#83B5ED]/35 bg-[#071528] p-3">
                      <p className="font-mono text-[10px] tracking-[0.14em] text-[#83B5ED] uppercase">
                        PDF Source Note
                      </p>
                      <p className="mt-1 font-sans text-xs leading-relaxed text-[#E8E1D2]/80">
                        {selectedMember.ambiguityNote}
                      </p>
                    </div>
                  )}
                </div>

                {/* Navigation Between Board Pieces */}
                <div className="mt-6 flex items-center justify-between gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => stepMember(-1)}
                    className="inline-flex items-center gap-1.5 border border-[#263D59] bg-[#071426] px-3.5 py-2 font-mono text-[11px] tracking-[0.12em] text-[#E8E1D2]/85 uppercase transition-colors hover:border-[#D5BD8B] hover:text-[#D5BD8B] whitespace-nowrap shrink-0"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Previous</span>
                  </button>
                  <span className="font-mono text-[11px] tabular-nums text-[#E8E1D2]/55">
                    {selectedIndex + 1} / {EXECUTIVE_BOARD_MEMBERS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => stepMember(1)}
                    className="inline-flex items-center gap-1.5 border border-[#263D59] bg-[#071426] px-3.5 py-2 font-mono text-[11px] tracking-[0.12em] text-[#E8E1D2]/85 uppercase transition-colors hover:border-[#D5BD8B] hover:text-[#D5BD8B] whitespace-nowrap shrink-0"
                  >
                    <span>Next</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-[#B89A62]/25 pb-4">
                    <span className="font-mono text-[11px] tracking-[0.16em] text-[#83B5ED] uppercase">
                      Court Overview
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[#D5BD8B]">
                      1 Board · {EXECUTIVE_BOARD_MEMBERS.length} Pieces
                    </span>
                  </div>

                  <h3 className="mt-6 font-display text-3xl leading-snug font-medium text-[#E8E1D2]">
                    Select Any Piece on the Board
                  </h3>

                  <p className="mt-3 font-sans text-sm leading-relaxed text-[#E8E1D2]/75">
                    Every member of the LISMUN organizational chart stands on a
                    single 8×8 board (H1 light orientation). Top Secretariat
                    presides along Rank 8 above 12 contiguous department zones,
                    with IT Co-Heads Ahmed Magdi and Mohammed magdi seated as
                    Rooks.
                  </p>

                  <div className="mt-7 space-y-3 border-y border-[#263D59]/55 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3.5 w-3.5 border border-[#F0DFB8]/70 bg-[#E3C991]"
                          aria-hidden="true"
                        />
                        <span className="font-sans text-xs font-medium text-[#E8E1D2]">
                          Gold Finish Clusters
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[#D5BD8B]">
                        {goldCount} Appointments
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3.5 w-3.5 border border-[#D5BD8B]/60 bg-[#1C4580]"
                          aria-hidden="true"
                        />
                        <span className="font-sans text-xs font-medium text-[#E8E1D2]">
                          Navy Lacquer Clusters
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[#83B5ED]">
                        {navyCount} Appointments
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMember(primarySgMember)}
                    className="atlas-btn-gold flex w-full items-center justify-between gap-2 bg-[#0D1E36] px-4 py-3 text-left font-sans text-xs font-semibold tracking-[0.08em] text-[#E8E1D2] uppercase"
                  >
                    <span className="min-w-0 leading-snug">
                      Begin Inspection at Secretaries-General
                    </span>
                    <ChevronRight className="atlas-btn-arrow h-4 w-4 shrink-0 text-[#D5BD8B]" />
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Accessible Department & Member Index Below Board */}
        <div className="mt-10 border-t border-[#B89A62]/20 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] text-[#83B5ED] uppercase">
                Executive Board Directory
              </p>
              <p className="mt-1 font-sans text-xs text-[#E8E1D2]/65">
                Filter by department to highlight its cluster on the 8×8 board, or click any member to zoom to their square.
              </p>
            </div>
            {highlightedRank && (
              <button
                type="button"
                onClick={() => setHighlightedRank(null)}
                className="border border-[#B89A62]/40 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-[#D5BD8B] uppercase hover:border-[#D5BD8B]"
              >
                Clear Rank Filter ({PIECE_RANK_LABELS[highlightedRank]})
              </button>
            )}
          </div>

          {/* Department Tabs */}
          <div
            role="tablist"
            aria-label="Filter Executive Board by department"
            className="mt-5 flex flex-wrap gap-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeDepartment === 'ALL'}
              onClick={() => setActiveDepartment('ALL')}
              className={`border px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors whitespace-nowrap shrink-0 ${
                activeDepartment === 'ALL'
                  ? 'border-[#D5BD8B] bg-[#0F2442] text-[#F0DFB8]'
                  : 'border-[#B89A62]/20 bg-[#040D1B] text-[#E8E1D2]/70 hover:border-[#B89A62]/50 hover:text-[#E8E1D2]'
              }`}
            >
              All ({EXECUTIVE_BOARD_MEMBERS.length})
            </button>
            {EXECUTIVE_DEPARTMENTS.map((dept) => {
              const selected = activeDepartment === dept;
              return (
                <button
                  key={dept}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveDepartment(dept)}
                  className={`border px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors whitespace-nowrap shrink-0 ${
                    selected
                      ? 'border-[#D5BD8B] bg-[#0F2442] text-[#F0DFB8]'
                      : 'border-[#B89A62]/20 bg-[#040D1B] text-[#E8E1D2]/70 hover:border-[#B89A62]/50 hover:text-[#E8E1D2]'
                  }`}
                >
                  {dept}
                </button>
              );
            })}
          </div>

          {/* Member Cards Grid */}
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredDirectoryMembers.map((member) => {
              const isSelected = selectedMember?.id === member.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleSelectMemberFromDirectory(member)}
                  className={`flex items-center gap-3 border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-[#D5BD8B] bg-[#102644]'
                      : 'border-[#B89A62]/20 bg-[#040D1B]/85 hover:border-[#83B5ED]/60 hover:bg-[#08162C]'
                  }`}
                >
                  <ChessPieceGlyph
                    pieceType={member.pieceType}
                    side={member.side}
                    size={26}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg leading-tight font-medium text-[#E8E1D2]">
                      {member.fullName}
                    </p>
                    <p className="mt-0.5 truncate font-sans text-[11px] text-[#D5BD8B]">
                      {member.officialPosition}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] tracking-[0.1em] text-[#83B5ED]/85 uppercase">
                      {member.department} · {member.squareNotation}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Transparent PDF Source Audit & Flagged Ambiguities */}
          <div className="mt-8 border border-[#B89A62]/25 bg-[#040C1A]/90 p-4 sm:p-5">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#83B5ED] uppercase">
              PDF Source Verification · Flagged Chart Ambiguities
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {PDF_AMBIGUITIES_FOR_REVIEW.map((flag) => (
                <div
                  key={flag.id}
                  className="border-l-2 border-[#B89A62]/55 bg-[#061124] px-3 py-2"
                >
                  <p className="font-mono text-[11px] font-medium text-[#D5BD8B]">
                    {flag.entry}
                  </p>
                  <p className="mt-1 font-sans text-xs leading-relaxed text-[#E8E1D2]/75">
                    {flag.details}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
