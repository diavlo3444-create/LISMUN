export type ChessPieceType =
  | 'king'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'pawn';

export type ChessSide = 'gold' | 'navy';

export interface DepartmentZoneBounds {
  department: string;
  shortLabel: string;
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
  accentSide: ChessSide;
}

export interface ExecutiveBoardMember {
  id: string;
  fullName: string;
  officialPosition: string;
  department: string;
  departments: readonly string[];
  hierarchicalLevel: string;
  pieceType: ChessPieceType;
  side: ChessSide;
  boardRow: number; // 0..7 (0 = Rank 8 north/top, 7 = Rank 1 south/bottom)
  boardCol: number; // 0..7 (0 = File A west/left, 7 = File H east/right)
  squareNotation: string; // Standard algebraic A1..H8
  ambiguityNote?: string;
}

export interface ChessHierarchyLegendItem {
  pieceType: ChessPieceType;
  pieceLabel: string;
  hierarchyTitle: string;
  scopeDescription: string;
  count: number;
}

export interface PdfAmbiguityFlag {
  id: string;
  entry: string;
  details: string;
}

export const BOARD_COLS = 8;
export const BOARD_ROWS = 8;

export const FILE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/**
 * Standard 8x8 chessboard parity when row 0 = Rank 8 (north) and col 0 = File A (west):
 * - a8 (0, 0) is Light
 * - h8 (0, 7) is Dark
 * - a1 (7, 0) is Dark
 * - h1 (7, 7) is Light  <-- bottom-right square is light
 * - d1 (7, 3) is Light
 * - d8 (0, 3) is Dark
 */
export function isLightSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

export function toSquareNotation(row: number, col: number): string {
  const file = FILE_LETTERS[col] ?? '?';
  const rank = BOARD_ROWS - row;
  return `${file}${rank}`;
}

export const DEPARTMENT_ZONES: readonly DepartmentZoneBounds[] = [
  {
    department: 'SECRETARIES',
    shortLabel: 'SECRETARIES',
    rowMin: 0,
    rowMax: 0,
    colMin: 1,
    colMax: 6,
    accentSide: 'gold',
  },
  {
    department: 'LOGISTICS',
    shortLabel: 'LOGISTICS',
    rowMin: 1,
    rowMax: 2,
    colMin: 0,
    colMax: 1,
    accentSide: 'gold',
  },
  {
    department: 'SECURITY',
    shortLabel: 'SECURITY',
    rowMin: 1,
    rowMax: 2,
    colMin: 2,
    colMax: 3,
    accentSide: 'navy',
  },
  {
    department: 'CEREMONIES',
    shortLabel: 'CEREMONIES',
    rowMin: 1,
    rowMax: 2,
    colMin: 4,
    colMax: 4,
    accentSide: 'gold',
  },
  {
    department: 'DCC',
    shortLabel: 'DCC',
    rowMin: 1,
    rowMax: 2,
    colMin: 5,
    colMax: 5,
    accentSide: 'navy',
  },
  {
    department: 'IT',
    shortLabel: 'IT',
    rowMin: 1,
    rowMax: 2,
    colMin: 6,
    colMax: 7,
    accentSide: 'gold',
  },
  {
    department: 'MARKETING',
    shortLabel: 'MARKETING',
    rowMin: 3,
    rowMax: 4,
    colMin: 0,
    colMax: 3,
    accentSide: 'navy',
  },
  {
    department: 'VOLUNTEERS',
    shortLabel: 'VOLUNTEERS',
    rowMin: 3,
    rowMax: 4,
    colMin: 4,
    colMax: 5,
    accentSide: 'gold',
  },
  {
    department: 'DESIGN',
    shortLabel: 'DESIGN',
    rowMin: 3,
    rowMax: 4,
    colMin: 6,
    colMax: 7,
    accentSide: 'navy',
  },
  {
    department: 'HR',
    shortLabel: 'HR',
    rowMin: 6,
    rowMax: 7,
    colMin: 0,
    colMax: 1,
    accentSide: 'gold',
  },
  {
    department: 'MEDIA',
    shortLabel: 'MEDIA',
    rowMin: 6,
    rowMax: 7,
    colMin: 2,
    colMax: 3,
    accentSide: 'navy',
  },
  {
    department: 'PRESS',
    shortLabel: 'PRESS',
    rowMin: 6,
    rowMax: 7,
    colMin: 4,
    colMax: 5,
    accentSide: 'gold',
  },
  {
    department: 'PR',
    shortLabel: 'PR',
    rowMin: 6,
    rowMax: 6,
    colMin: 6,
    colMax: 7,
    accentSide: 'navy',
  },
];

function entry(
  id: string,
  fullName: string,
  officialPosition: string,
  department: string,
  departments: readonly string[],
  hierarchicalLevel: string,
  pieceType: ChessPieceType,
  side: ChessSide,
  boardRow: number,
  boardCol: number,
  ambiguityNote?: string
): ExecutiveBoardMember {
  return {
    id,
    fullName,
    officialPosition,
    department,
    departments,
    hierarchicalLevel,
    pieceType,
    side,
    boardRow,
    boardCol,
    squareNotation: toSquareNotation(boardRow, boardCol),
    ...(ambiguityNote ? { ambiguityNote } : {}),
  };
}

/**
 * Source of truth: /public/assets/aistudio/LISMUN_Organizational_Tree_986a56ef.pdf (Page 1)
 *
 * ONE single 8x8 chessboard (64 squares) representing all 46 unique individuals:
 * - Upper-Central Apex (Rank 8 / Row 0, B8..G8): Top Secretariat (SG, DSG, USG, Senior Advisors)
 * - Upper Directorate Tier (Ranks 7–6 / Rows 1–2): Logistics, Security, Ceremonies, DCC, IT
 * - Middle Directorate Tier (Ranks 5–4 / Rows 3–4): Marketing, Volunteers, Design
 * - Open Meridian Corridor (Rank 3 / Row 5)
 * - Lower Directorate Tier (Ranks 2–1 / Rows 6–7): HR, Media, Press, PR
 *
 * Special IT Co-Head Override:
 * - Ahmed Magdi -> Rook (IT Co-Head)
 * - Mohammed magdi -> Rook (IT Co-Head)
 */
export const EXECUTIVE_BOARD_MEMBERS: readonly ExecutiveBoardMember[] = [
  // =========================================================================
  // RANK 8 (Row 0, Upper-Central Apex) — SECRETARIES (6 Members)
  // =========================================================================
  entry(
    'sec-adv-najla',
    'najla rami',
    'Senior advisors',
    'SECRETARIES',
    ['SECRETARIES'],
    'Senior Executive & Advisory Leadership',
    'rook',
    'navy',
    0,
    1 // B8
  ),
  entry(
    'sec-adv-marwan',
    'marwan nasr',
    'Senior advisors',
    'SECRETARIES',
    ['SECRETARIES'],
    'Senior Executive & Advisory Leadership',
    'rook',
    'gold',
    0,
    2 // C8
  ),
  entry(
    'sec-dsg-mohammed',
    'mohammed walid',
    'DSG',
    'SECRETARIES',
    ['SECRETARIES'],
    'Highest Secretariat Leadership · Deputy Secretary-General',
    'queen',
    'gold',
    0,
    3 // D8 (Dark square)
  ),
  entry(
    'sec-sg-mallak',
    'mallak abbas',
    'SG',
    'SECRETARIES',
    ['SECRETARIES'],
    'Highest Secretariat Leadership · Secretary-General',
    'king',
    'gold',
    0,
    4 // E8
  ),
  entry(
    'sec-sg-sollaf',
    'sollaf mustafa',
    'SG',
    'SECRETARIES',
    ['SECRETARIES'],
    'Highest Secretariat Leadership · Secretary-General',
    'king',
    'navy',
    0,
    5 // F8
  ),
  entry(
    'sec-usg-lily',
    'lily',
    'USG',
    'SECRETARIES',
    ['SECRETARIES'],
    'Senior Executive Leadership · Under-Secretary-General',
    'rook',
    'gold',
    0,
    6 // G8
  ),

  // =========================================================================
  // RANKS 7–6 (Rows 1–2, Upper Directorate Tier) — LOGISTICS, SECURITY, CEREMONIES, DCC, IT
  // =========================================================================
  // LOGISTICS (3 — Cols A–B, Gold)
  entry(
    'log-head-elias',
    'Elias Niazy',
    'Head',
    'LOGISTICS',
    ['LOGISTICS'],
    'Department Head',
    'bishop',
    'gold',
    1,
    0 // A7
  ),
  entry(
    'log-head-ahmed',
    'ahmed al amir',
    'Head',
    'LOGISTICS',
    ['LOGISTICS'],
    'Department Head',
    'bishop',
    'gold',
    1,
    1 // B7
  ),
  entry(
    'log-co-muaz',
    'muaz al amir',
    'Co-Head',
    'LOGISTICS',
    ['LOGISTICS'],
    'Department Co-Head',
    'knight',
    'gold',
    2,
    0 // A6
  ),

  // SECURITY (3 — Cols C–D, Navy)
  entry(
    'sec-head-zeina',
    'zeina',
    'Female head of security',
    'SECURITY',
    ['SECURITY'],
    'Department Head',
    'bishop',
    'navy',
    1,
    2 // C7
  ),
  entry(
    'sec-head-middo',
    'middo wazzi',
    'Male head of security',
    'SECURITY',
    ['SECURITY'],
    'Department Head',
    'bishop',
    'navy',
    1,
    3 // D7
  ),
  entry(
    'sec-co-ward',
    'ward ajaj',
    'Co-head of security',
    'SECURITY',
    ['SECURITY'],
    'Department Co-Head',
    'knight',
    'navy',
    2,
    2 // C6
  ),

  // CEREMONIES (2 — Col E, Gold)
  entry(
    'cer-head-mila',
    'Mila farhat',
    'Head',
    'CEREMONIES',
    ['CEREMONIES'],
    'Department Head',
    'bishop',
    'gold',
    1,
    4 // E7
  ),
  entry(
    'cer-co-maryam',
    'Maryam Islam',
    'Co head',
    'CEREMONIES',
    ['CEREMONIES'],
    'Department Co-Head',
    'knight',
    'gold',
    2,
    4 // E6
  ),

  // DCC (2 dedicated + loor al masri dual DCC/PR — Col F, Navy)
  entry(
    'dcc-head-maria',
    'maria hamadeh',
    'Head',
    'DCC',
    ['DCC'],
    'Department Head',
    'bishop',
    'navy',
    1,
    5 // F7
  ),
  entry(
    'dcc-co-ziad',
    'Ziad Alhllak',
    'Co head',
    'DCC',
    ['DCC'],
    'Department Co-Head',
    'knight',
    'navy',
    2,
    5 // F6
  ),

  // IT (3 — Cols G–H, Gold — Special Rook Assignment for Ahmed Magdi & Mohammed magdi)
  entry(
    'it-head-saleh',
    'Saleh Samaha',
    'Head',
    'IT',
    ['IT'],
    'Department Head',
    'bishop',
    'gold',
    1,
    6 // G7
  ),
  entry(
    'it-co-ahmed',
    'Ahmed Magdi',
    'Co head',
    'IT',
    ['IT'],
    'Department Co-Head · Special Senior Rook Assignment',
    'rook',
    'gold',
    1,
    7 // H7
  ),
  entry(
    'it-co-mohammed',
    'Mohammed magdi',
    'Co head',
    'IT',
    ['IT'],
    'Department Co-Head · Special Senior Rook Assignment',
    'rook',
    'navy',
    2,
    7 // H6
  ),

  // =========================================================================
  // RANKS 5–4 (Rows 3–4, Middle Directorate Tier) — MARKETING, VOLUNTEERS, DESIGN
  // =========================================================================
  // MARKETING (8 — Cols A–D, Navy)
  entry(
    'mkt-head-maria',
    'Maria aljaber',
    'Head',
    'MARKETING',
    ['MARKETING'],
    'Department Head',
    'bishop',
    'navy',
    3,
    0 // A5
  ),
  entry(
    'mkt-head-jayda',
    'Jayda Yasser Gad',
    'Head',
    'MARKETING',
    ['MARKETING'],
    'Department Head',
    'bishop',
    'navy',
    3,
    1 // B5
  ),
  entry(
    'mkt-co-areej',
    'Areej Mostafa',
    'Co head',
    'MARKETING',
    ['MARKETING'],
    'Department Co-Head',
    'knight',
    'navy',
    3,
    2 // C5
  ),
  entry(
    'mkt-co-sa3ied',
    'sa3ied',
    'Co head',
    'MARKETING',
    ['MARKETING'],
    'Department Co-Head',
    'knight',
    'navy',
    3,
    3 // D5
  ),
  entry(
    'mkt-co-jawaher',
    'jawaher fateh',
    'Co head',
    'MARKETING',
    ['MARKETING'],
    'Department Co-Head',
    'knight',
    'navy',
    4,
    0 // A4
  ),
  entry(
    'mkt-mem-jana',
    'jana samer',
    'Member',
    'MARKETING',
    ['MARKETING'],
    'Department Member',
    'pawn',
    'navy',
    4,
    1 // B4
  ),
  entry(
    'mkt-mem-rayan',
    'rayan',
    'Member',
    'MARKETING',
    ['MARKETING'],
    'Department Member',
    'pawn',
    'navy',
    4,
    2 // C4
  ),
  entry(
    'mkt-mem-sahar',
    'sahar',
    'Member',
    'MARKETING',
    ['MARKETING'],
    'Department Member',
    'pawn',
    'navy',
    4,
    3 // D4
  ),

  // VOLUNTEERS (3 — Cols E–F, Gold)
  entry(
    'vol-head-lana',
    'lana ahmed',
    'Female head of vol',
    'VOLUNTEERS',
    ['VOLUNTEERS'],
    'Department Head',
    'bishop',
    'gold',
    3,
    4 // E5
  ),
  entry(
    'vol-head-rayyan',
    'Rayyan Abu sharshoh',
    'Male head of vol',
    'VOLUNTEERS',
    ['VOLUNTEERS'],
    'Department Head',
    'bishop',
    'gold',
    3,
    5 // F5
  ),
  entry(
    'vol-co-rayan',
    'rayan rihan',
    'Co-head',
    'VOLUNTEERS',
    ['VOLUNTEERS'],
    'Department Co-Head',
    'knight',
    'gold',
    4,
    4 // E4
  ),

  // DESIGN (4 — Cols G–H, Navy)
  entry(
    'des-head-saud',
    'saud alanazi',
    'Head',
    'DESIGN',
    ['DESIGN'],
    'Department Head',
    'bishop',
    'navy',
    3,
    6 // G5
  ),
  entry(
    'des-co-mahnoor',
    'mahnoor',
    'Co head',
    'DESIGN',
    ['DESIGN'],
    'Department Co-Head',
    'knight',
    'navy',
    3,
    7 // H5
  ),
  entry(
    'des-mem-ahmed',
    'ahmed jameil',
    'Members',
    'DESIGN',
    ['DESIGN'],
    'Department Member',
    'pawn',
    'navy',
    4,
    6, // G4
    'Flagged PDF similarity: "ahmed jameil" (Design Members) vs "Ahmed Jamiel" (HR Head). Kept distinct without guessing.'
  ),
  entry(
    'des-mem-alya',
    'alya ismail',
    'Members',
    'DESIGN',
    ['DESIGN'],
    'Department Member',
    'pawn',
    'navy',
    4,
    7 // H4
  ),

  // =========================================================================
  // RANKS 2–1 (Rows 6–7, Lower Directorate Tier) — HR, MEDIA, PRESS, PR
  // =========================================================================
  // HR (4 — Cols A–B, Gold)
  entry(
    'hr-head-ahmed',
    'Ahmed Jamiel',
    'Head',
    'HR',
    ['HR'],
    'Department Head',
    'bishop',
    'gold',
    6,
    0, // A2
    'Flagged PDF similarity: "Ahmed Jamiel" (HR Head) vs "ahmed jameil" (Design Members). Kept distinct without guessing.'
  ),
  entry(
    'hr-head-jana',
    'jana hashem',
    'Head',
    'HR',
    ['HR'],
    'Department Head',
    'bishop',
    'gold',
    6,
    1 // B2
  ),
  entry(
    'hr-co-aya',
    'aya nezar',
    'Co head',
    'HR',
    ['HR'],
    'Department Co-Head',
    'knight',
    'gold',
    7,
    0 // A1
  ),
  entry(
    'hr-co-layan',
    'layan ahmed',
    'Co head',
    'HR',
    ['HR'],
    'Department Co-Head',
    'knight',
    'gold',
    7,
    1 // B1
  ),

  // MEDIA (3 — Cols C–D, Navy)
  entry(
    'med-head-ghazl',
    'ghazl',
    'Head of media female',
    'MEDIA',
    ['MEDIA'],
    'Department Head',
    'bishop',
    'navy',
    6,
    2 // C2
  ),
  entry(
    'med-head-fahad',
    'fahad al kendi',
    'Head of media male',
    'MEDIA',
    ['MEDIA'],
    'Department Head',
    'bishop',
    'navy',
    6,
    3 // D2
  ),
  entry(
    'med-co-sarah',
    'sarah al kendi',
    'Co-head of media',
    'MEDIA',
    ['MEDIA'],
    'Department Co-Head',
    'knight',
    'navy',
    7,
    2 // C1
  ),

  // PRESS (3 — Cols E–F, Gold)
  entry(
    'prs-head-eyad',
    'eyad hisham',
    'Male Head',
    'PRESS',
    ['PRESS'],
    'Department Head',
    'bishop',
    'gold',
    6,
    4 // E2
  ),
  entry(
    'prs-head-pearla',
    'pearla',
    'Female head',
    'PRESS',
    ['PRESS'],
    'Department Head',
    'bishop',
    'gold',
    6,
    5 // F2
  ),
  entry(
    'prs-co-yousef',
    'yousef saifi',
    'Co head',
    'PRESS',
    ['PRESS'],
    'Department Co-Head',
    'knight',
    'gold',
    7,
    4 // E1
  ),

  // PR (Cols G–H, Navy)
  entry(
    'pr-head-eyad',
    '(prob eyad)',
    'Head',
    'PR',
    ['PR'],
    'Department Head',
    'bishop',
    'navy',
    6,
    6, // G2
    'Flagged PDF uncertainty: PR Head is written verbatim as "(prob eyad)" in the organizational chart; preserved as documented.'
  ),
  entry(
    'pr-dcc-co-loor',
    'loor al masri',
    'Co head',
    'DCC & PR',
    ['DCC', 'PR'],
    'Department Co-Head',
    'knight',
    'navy',
    6,
    7, // H2
    'Flagged dual-department listing: "loor al masri" appears identically as Co head under both DCC and PR in the PDF; unified onto one Knight piece.'
  ),
];

export const PDF_AMBIGUITIES_FOR_REVIEW: readonly PdfAmbiguityFlag[] = [
  {
    id: 'loor-dual-dept',
    entry: 'loor al masri — Co head (DCC & PR)',
    details:
      'Listed identically as Co head under both DCC and PR in the PDF; unified onto a single Knight piece on H2 covering both departments so every individual appears exactly once.',
  },
  {
    id: 'prob-eyad-uncertain',
    entry: '(prob eyad) — Head (PR)',
    details:
      'Preserved verbatim as "(prob eyad)" rather than silently merging with Press Male Head "eyad hisham".',
  },
  {
    id: 'ahmed-jamiel-casing',
    entry: 'ahmed jameil (Design Members) vs Ahmed Jamiel (HR Head)',
    details:
      'Preserved as separate entries because casing, department, and rank differ in the PDF chart.',
  },
  {
    id: 'zeina-security-only',
    entry: 'zeina — Female head of security (SECURITY)',
    details:
      'Cross-checked against page 1 of the PDF visual chart: Zeina is listed only under Security, not under Logistics.',
  },
];

export const EXECUTIVE_DEPARTMENTS: readonly string[] = [
  'SECRETARIES',
  'LOGISTICS',
  'SECURITY',
  'MARKETING',
  'CEREMONIES',
  'DCC',
  'IT',
  'VOLUNTEERS',
  'DESIGN',
  'HR',
  'MEDIA',
  'PRESS',
  'PR',
];

export const CHESS_PIECE_LEGEND: readonly ChessHierarchyLegendItem[] = [
  {
    pieceType: 'king',
    pieceLabel: 'King',
    hierarchyTitle: 'SG · Highest Secretariat',
    scopeDescription: 'Secretaries-General presiding at the Rank 8 apex (E8 & F8).',
    count: EXECUTIVE_BOARD_MEMBERS.filter((m) => m.pieceType === 'king').length,
  },
  {
    pieceType: 'queen',
    pieceLabel: 'Queen',
    hierarchyTitle: 'DSG · Highest Secretariat',
    scopeDescription: 'Deputy Secretary-General stationed on dark square D8.',
    count: EXECUTIVE_BOARD_MEMBERS.filter((m) => m.pieceType === 'queen').length,
  },
  {
    pieceType: 'rook',
    pieceLabel: 'Rook',
    hierarchyTitle: 'USG, Senior Advisors & IT Co-Heads',
    scopeDescription:
      'USG, Senior Advisors (Rank 8), plus Ahmed Magdi & Mohammed magdi (IT).',
    count: EXECUTIVE_BOARD_MEMBERS.filter((m) => m.pieceType === 'rook').length,
  },
  {
    pieceType: 'bishop',
    pieceLabel: 'Bishop',
    hierarchyTitle: 'Department Heads',
    scopeDescription: 'All 19 Directorate Heads heading each department cluster.',
    count: EXECUTIVE_BOARD_MEMBERS.filter((m) => m.pieceType === 'bishop').length,
  },
  {
    pieceType: 'knight',
    pieceLabel: 'Knight',
    hierarchyTitle: 'Co-Heads & Specialized Roles',
    scopeDescription: 'Department Co-Heads grouped directly with their leaders.',
    count: EXECUTIVE_BOARD_MEMBERS.filter((m) => m.pieceType === 'knight').length,
  },
  {
    pieceType: 'pawn',
    pieceLabel: 'Pawn',
    hierarchyTitle: 'General Members',
    scopeDescription: 'Marketing and Design Members anchored within their blocks.',
    count: EXECUTIVE_BOARD_MEMBERS.filter((m) => m.pieceType === 'pawn').length,
  },
];

export function getHierarchyCounts(
  members: readonly ExecutiveBoardMember[] = EXECUTIVE_BOARD_MEMBERS
): Record<ChessPieceType, number> {
  const counts: Record<ChessPieceType, number> = {
    king: 0,
    queen: 0,
    rook: 0,
    bishop: 0,
    knight: 0,
    pawn: 0,
  };
  for (const m of members) {
    counts[m.pieceType] += 1;
  }
  return counts;
}

export function getMemberBySquare(
  row: number,
  col: number,
  members: readonly ExecutiveBoardMember[] = EXECUTIVE_BOARD_MEMBERS
): ExecutiveBoardMember | undefined {
  return members.find((m) => m.boardRow === row && m.boardCol === col);
}

export function getMembersByDepartment(
  department: string,
  members: readonly ExecutiveBoardMember[] = EXECUTIVE_BOARD_MEMBERS
): ExecutiveBoardMember[] {
  return members.filter(
    (m) => m.departments.includes(department) || m.department === department
  );
}
